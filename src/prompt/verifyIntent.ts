import { readFile } from "node:fs/promises";
import { scanPaths } from "../scanner/index.js";
import { discoverFiles, toReportPath } from "../scanner/fileDiscovery.js";
import type { IntentVerificationReport, VerificationControl, VerificationFinding } from "../types.js";
import { classifyPrompt } from "./classifyPrompt.js";
import { policyPacks } from "./policyPacks.js";

interface FileContents {
  file: string;
  lines: string[];
}

export async function verifyPromptOutput(
  prompt: string,
  paths: string[],
  cwd = process.cwd()
): Promise<IntentVerificationReport> {
  const classification = classifyPrompt(prompt);
  const controls = getControlsForCategories(classification.categories);
  const files = await readFiles(paths.length > 0 ? paths : ["."], cwd);
  const scanReport = await scanPaths(paths.length > 0 ? paths : ["."], { cwd, writeFindings: true });
  const satisfiedControls: VerificationFinding[] = [];
  const missingControls: VerificationFinding[] = [];

  for (const control of controls) {
    const evidence = findEvidence(control, files);

    if (evidence) {
      satisfiedControls.push({
        controlId: control.id,
        category: control.category,
        description: control.description,
        fix: control.fix,
        evidence
      });
    } else {
      missingControls.push({
        controlId: control.id,
        category: control.category,
        description: control.description,
        fix: control.fix
      });
    }
  }

  return {
    prompt,
    classification,
    filesChecked: files.length,
    satisfiedControls,
    missingControls,
    scanReport,
    passed: missingControls.length === 0 && !scanReport.blocked
  };
}

function getControlsForCategories(categories: string[]): VerificationControl[] {
  const controls = policyPacks
    .filter((pack) => categories.includes(pack.id))
    .flatMap((pack) => pack.controls);

  return controls;
}

async function readFiles(paths: string[], cwd: string): Promise<FileContents[]> {
  const filePaths = await discoverFiles(paths, cwd);
  const files = await Promise.all(filePaths.map(async (filePath) => ({
    file: toReportPath(filePath, cwd),
    lines: (await readFile(filePath, "utf8")).split(/\r?\n/)
  })));

  return files;
}

function findEvidence(control: VerificationControl, files: FileContents[]): VerificationFinding["evidence"] | undefined {
  const patterns = control.evidencePatterns.map((pattern) => new RegExp(pattern, "i"));

  for (const file of files) {
    for (const [index, line] of file.lines.entries()) {
      if (patterns.some((pattern) => pattern.test(line))) {
        return {
          file: file.file,
          line: index + 1,
          text: redactEvidence(line.trim())
        };
      }
    }
  }

  return undefined;
}

function redactEvidence(line: string): string {
  return line
    .replace(/AKIA[0-9A-Z]{16}/g, "AKIA****************")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-********")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "sk_********")
    .replace(/(password\s*[:=]\s*['"])[^'"]+(['"])/gi, "$1********$2");
}
