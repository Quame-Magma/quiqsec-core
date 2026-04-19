import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import type { ExternalScannerReport, IssueSummary, ScanResult, Severity } from "../types.js";
import { createFindingId, redactEvidence } from "./finding.js";

const execFileAsync = promisify(execFile);

interface ExternalScannerOptions {
  cwd: string;
  useSemgrep: boolean;
  useGitleaks: boolean;
  timeoutMs: number;
}

export async function runExternalScanners(paths: string[], options: ExternalScannerOptions): Promise<ExternalScannerReport> {
  const findings: ScanResult[] = [];
  const toolsUsed: string[] = [];
  const errors: string[] = [];
  const scanTargets = paths.length > 0 ? paths : ["."];

  if (options.useSemgrep) {
    const result = await runSemgrep(scanTargets, options.cwd, options.timeoutMs);
    findings.push(...result.findings);
    toolsUsed.push(...result.toolsUsed);
    errors.push(...result.errors);
  }

  if (options.useGitleaks) {
    const result = await runGitleaks(scanTargets, options.cwd, options.timeoutMs);
    findings.push(...result.findings);
    toolsUsed.push(...result.toolsUsed);
    errors.push(...result.errors);
  }

  return {
    findings,
    toolsUsed: Array.from(new Set(toolsUsed)),
    errors
  };
}

export function summarizeBySeverity(findings: ScanResult[]): IssueSummary {
  return findings.reduce<IssueSummary>((summary, finding) => {
    summary[finding.severity] += 1;
    return summary;
  }, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  });
}

async function runSemgrep(paths: string[], cwd: string, timeoutMs: number): Promise<ExternalScannerReport> {
  const findings: ScanResult[] = [];
  const toolsUsed: string[] = [];
  const errors: string[] = [];

  try {
    const args = [
      "scan",
      "--json",
      "--quiet",
      "--config",
      "auto",
      ...paths
    ];

    const { stdout } = await execFileAsync("semgrep", args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024
    });

    const payload = JSON.parse(stdout) as {
      results?: Array<{
        check_id?: string;
        path?: string;
        extra?: {
          message?: string;
          severity?: string;
          lines?: string;
        };
        start?: {
          line?: number;
          col?: number;
        };
      }>;
    };

    for (const item of payload.results ?? []) {
      const file = normalizePath(item.path ?? "unknown");
      const line = item.start?.line ?? 1;
      const column = item.start?.col ?? 1;
      const ruleId = item.check_id ?? "semgrep.rule";
      const message = item.extra?.message ?? "Semgrep finding";
      const evidence = redactEvidence((item.extra?.lines ?? "").trim());
      findings.push({
        id: createFindingId(ruleId, file, line, column),
        tool: "Semgrep",
        severity: toSeverity(item.extra?.severity),
        file,
        line,
        column,
        message,
        ruleId,
        fix: {
          type: "prompt",
          content: "Address the Semgrep finding and keep behavior unchanged except for the security fix."
        },
        evidence: evidence || undefined
      });
    }

    toolsUsed.push("semgrep");
  } catch (error) {
    errors.push(toScannerError("semgrep", error));
  }

  return { findings, toolsUsed, errors };
}

async function runGitleaks(paths: string[], cwd: string, timeoutMs: number): Promise<ExternalScannerReport> {
  const findings: ScanResult[] = [];
  const toolsUsed: string[] = [];
  const errors: string[] = [];

  try {
    const args = ["detect", "--no-git", "--redact", "--report-format", "json", "--source", "."];
    const { stdout } = await execFileAsync("gitleaks", args, {
      cwd,
      timeout: timeoutMs,
      maxBuffer: 4 * 1024 * 1024
    });

    const payload = JSON.parse(stdout) as Array<{
      RuleID?: string;
      Description?: string;
      File?: string;
      StartLine?: number;
      StartColumn?: number;
      Match?: string;
      Secret?: string;
    }>;

    for (const item of payload ?? []) {
      const absoluteOrRelative = item.File ?? "unknown";
      const normalized = normalizePath(path.isAbsolute(absoluteOrRelative)
        ? path.relative(cwd, absoluteOrRelative)
        : absoluteOrRelative);

      // Only include matches for requested paths when explicit targets are provided.
      if (!includesRequestedPath(normalized, paths)) {
        continue;
      }

      const ruleId = item.RuleID ?? "gitleaks.secret";
      const line = item.StartLine ?? 1;
      const column = item.StartColumn ?? 1;
      const evidence = redactEvidence((item.Match ?? item.Secret ?? "").trim());

      findings.push({
        id: createFindingId(ruleId, normalized, line, column),
        tool: "Gitleaks",
        severity: "critical",
        file: normalized,
        line,
        column,
        message: item.Description ?? "Potential hardcoded secret detected",
        ruleId,
        fix: {
          type: "prompt",
          content: "Move the secret into environment variables or a secret manager and rotate compromised credentials."
        },
        evidence: evidence || undefined
      });
    }

    toolsUsed.push("gitleaks");
  } catch (error) {
    errors.push(toScannerError("gitleaks", error));
  }

  return { findings, toolsUsed, errors };
}

function includesRequestedPath(file: string, paths: string[]): boolean {
  if (paths.length === 0 || paths.includes(".")) {
    return true;
  }

  const normalizedFile = normalizePath(file);
  return paths.some((target) => {
    const normalizedTarget = normalizePath(target);
    return normalizedFile === normalizedTarget || normalizedFile.startsWith(`${normalizedTarget}/`);
  });
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "");
}

function toSeverity(value: string | undefined): Severity {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("error") || normalized.includes("critical")) {
    return "critical";
  }

  if (normalized.includes("high")) {
    return "high";
  }

  if (normalized.includes("warning") || normalized.includes("medium")) {
    return "medium";
  }

  return "low";
}

function toScannerError(tool: string, error: unknown): string {
  if (error instanceof Error) {
    return `${tool}: ${error.message}`;
  }

  return `${tool}: ${String(error)}`;
}
