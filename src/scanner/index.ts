import { readFile } from "node:fs/promises";
import { discoverFiles, toReportPath } from "./fileDiscovery.js";
import { scanDependencyArtifacts } from "./dependencyScanner.js";
import { runExternalScanners } from "./externalScanner.js";
import { scanTextWithRules } from "./ruleScanner.js";
import { createHealthReport, countIssues, shouldBlock } from "../policy.js";
import { appendTelemetry, saveFindings } from "../storage.js";
import type { ScanOptions, ScanReport, ScanResult } from "../types.js";
import { loadConfig } from "../config.js";
import { loadRules } from "../rules/loadRules.js";

export async function scanPaths(paths: string[], options: ScanOptions = {}): Promise<ScanReport> {
  const cwd = options.cwd ?? process.cwd();
  const scannedAt = new Date().toISOString();
  const config = await loadConfig(cwd);
  const rules = await loadRules(cwd, config.rules.paths);
  const files = await discoverFiles(paths, cwd, config.scan.exclude);
  const dependencyArtifacts = await scanDependencyArtifacts(paths, cwd, config.scan.exclude);
  const dependencyFiles = new Set(dependencyArtifacts.files);
  const ruleScanFiles = files.filter((filePath) => !dependencyFiles.has(filePath));
  const filesScanned = Array.from(new Set([...files, ...dependencyArtifacts.files]));
  const findings: ScanResult[] = [];

  for (const filePath of ruleScanFiles) {
    const contents = await readFile(filePath, "utf8");
    findings.push(...scanTextWithRules(toReportPath(filePath, cwd), contents, rules));
  }

  findings.push(...dependencyArtifacts.findings);

  const externalConfig = {
    semgrep: options.external?.semgrep ?? config.scan.external.semgrep,
    gitleaks: options.external?.gitleaks ?? config.scan.external.gitleaks,
    timeoutMs: options.external?.timeoutMs ?? config.scan.external.timeoutMs
  };
  const externalEnabled = options.useExternalScanners ?? (externalConfig.semgrep || externalConfig.gitleaks);
  if (externalEnabled) {
    const external = await runExternalScanners(paths, {
      cwd,
      useSemgrep: externalConfig.semgrep,
      useGitleaks: externalConfig.gitleaks,
      timeoutMs: externalConfig.timeoutMs
    });

    findings.push(...external.findings);

    if (external.errors.length > 0 && options.writeFindings !== false) {
      await appendTelemetry({
        id: `scan-ext-${Date.now()}`,
        type: "scan.completed",
        createdAt: scannedAt,
        data: {
          externalScannerErrors: external.errors,
          toolsAttempted: [
            externalConfig.semgrep ? "semgrep" : null,
            externalConfig.gitleaks ? "gitleaks" : null
          ].filter(Boolean)
        }
      }, cwd);
    }
  }

  const summary = countIssues(findings);
  const healthReport = createHealthReport(findings, scannedAt);
  const report: ScanReport = {
    generatedAt: scannedAt,
    root: cwd,
    filesScanned: filesScanned.length,
    findings,
    summary,
    healthReport,
    blocked: shouldBlock(summary)
  };

  if (options.writeFindings !== false) {
    await saveFindings(report, cwd);
  }

  return report;
}
