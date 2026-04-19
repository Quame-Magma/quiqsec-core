import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { createFindingId, redactEvidence } from "./finding.js";
import { toReportPath } from "./fileDiscovery.js";
import type { FixSuggestion, ScanResult, Severity } from "../types.js";

const TOOL_NAME = "QuiqSecDependencyScanner";
const IGNORED_SEGMENTS = new Set(["node_modules", ".git", "dist", ".quiqsec", "coverage"]);
const COMMON_PACKAGE_NAMES = [
  "axios",
  "chalk",
  "commander",
  "cors",
  "debug",
  "dotenv",
  "esbuild",
  "eslint",
  "express",
  "fastify",
  "jest",
  "koa",
  "lodash",
  "moment",
  "next",
  "pg",
  "prettier",
  "prisma",
  "react",
  "react-dom",
  "rxjs",
  "socket.io",
  "typescript",
  "uuid",
  "vite",
  "webpack",
  "zod"
];

const RISKY_PACKAGES: Record<string, { severity: Severity; reason: string }> = {
  "event-stream": {
    severity: "critical",
    reason: "historically compromised package"
  },
  "flatmap-stream": {
    severity: "critical",
    reason: "historically compromised package"
  },
  "eslint-scope": {
    severity: "high",
    reason: "historically compromised package"
  },
  "node-ipc": {
    severity: "high",
    reason: "historically compromised package"
  },
  request: {
    severity: "medium",
    reason: "deprecated and unmaintained package"
  }
};

const LOCKFILE_NAMES = new Set(["package-lock.json", "yarn.lock", "pnpm-lock.yaml", "pnpm-lock.yml"]);
const SOURCE_PATTERNS = [
  { ruleId: "dependency-git-source", severity: "high" as Severity, pattern: /\b(?:git\+|git:\/\/|git@|github:)/i, label: "git" },
  { ruleId: "dependency-http-source", severity: "high" as Severity, pattern: /\bhttps?:\/\/|http:\/\/|https:\/\//i, label: "http" },
  { ruleId: "dependency-file-source", severity: "medium" as Severity, pattern: /\b(?:file:|link:|workspace:)/i, label: "local" }
];

export interface DependencyScanResult {
  files: string[];
  findings: ScanResult[];
}

export async function scanDependencyArtifacts(
  inputPaths: string[],
  cwd = process.cwd(),
  excludePatterns: string[] = []
): Promise<DependencyScanResult> {
  const files = await discoverDependencyFiles(inputPaths, cwd, excludePatterns);
  const findings: ScanResult[] = [];

  for (const filePath of files) {
    const reportPath = toReportPath(filePath, cwd);
    const contents = await readFile(filePath, "utf8");
    const baseName = path.basename(filePath);

    if (baseName === "package.json") {
      findings.push(...scanPackageJson(reportPath, contents));
      continue;
    }

    if (baseName === "package-lock.json") {
      findings.push(...scanPackageLock(reportPath, contents));
      continue;
    }

    if (baseName === "yarn.lock") {
      findings.push(...scanYarnLock(reportPath, contents));
      continue;
    }

    if (baseName === "pnpm-lock.yaml" || baseName === "pnpm-lock.yml") {
      findings.push(...scanPnpmLock(reportPath, contents));
    }
  }

  return { files, findings };
}

export async function discoverDependencyFiles(
  inputPaths: string[],
  cwd = process.cwd(),
  excludePatterns: string[] = []
): Promise<string[]> {
  const roots = inputPaths.length > 0 ? inputPaths : ["."];
  const files: string[] = [];

  for (const inputPath of roots) {
    const absolutePath = path.resolve(cwd, inputPath);
    await collectDependencyFiles(absolutePath, files, cwd, excludePatterns, true);
  }

  return Array.from(new Set(files)).sort();
}

type PackageSection = "scripts" | "dependencies" | "devDependencies" | "optionalDependencies" | "peerDependencies";

async function collectDependencyFiles(
  absolutePath: string,
  files: string[],
  cwd: string,
  excludePatterns: string[],
  explicitRoot = false
): Promise<void> {
  if (!explicitRoot && isIgnoredPath(absolutePath, cwd, excludePatterns)) {
    return;
  }

  const info = await stat(absolutePath);

  if (info.isDirectory()) {
    const entries = await readdir(absolutePath);
    await Promise.all(entries.map((entry) => collectDependencyFiles(path.join(absolutePath, entry), files, cwd, excludePatterns)));
    return;
  }

  if (info.isFile() && isDependencyFile(absolutePath)) {
    files.push(absolutePath);
  }
}

function isIgnoredPath(absolutePath: string, cwd: string, excludePatterns: string[]): boolean {
  const baseName = path.basename(absolutePath);
  if ((baseName.startsWith("quiqsec-") && baseName.endsWith(".json")) || baseName.endsWith(".sarif")) {
    return true;
  }

  const ignoredBySegment = absolutePath.split(path.sep).some((segment) => IGNORED_SEGMENTS.has(segment));
  if (ignoredBySegment) {
    return true;
  }

  const reportPath = toReportPath(absolutePath, cwd);
  return excludePatterns.some((pattern) => reportPath === pattern || reportPath.startsWith(`${pattern}/`));
}

function isDependencyFile(filePath: string): boolean {
  return LOCKFILE_NAMES.has(path.basename(filePath)) || path.basename(filePath) === "package.json";
}

function scanPackageJson(file: string, contents: string): ScanResult[] {
  const findings: ScanResult[] = [];
  const lines = contents.split(/\r?\n/);
  let section: PackageSection | null = null;

  for (const [index, line] of lines.entries()) {
    const opened = line.match(/^\s*"(scripts|dependencies|devDependencies|optionalDependencies|peerDependencies)"\s*:\s*{\s*$/);
    if (opened) {
      section = opened[1] as unknown as PackageSection;
      continue;
    }

    if (section && /^\s*}\s*,?\s*$/.test(line)) {
      section = null;
      continue;
    }

    if (!section) {
      continue;
    }

    const entry = line.match(/^\s*"([^"]+)"\s*:\s*"([^"]*)"\s*,?\s*$/);
    if (!entry) {
      continue;
    }

    const name = entry[1];
    const value = entry[2];
    const column = line.indexOf(`"${name}"`) + 1;

    if (section === "scripts" && isLifecycleScript(name)) {
      const scriptRisk = classifyScript(value);
      findings.push(
        createDependencyFinding({
          file,
          line: index + 1,
          column,
          severity: scriptRisk.severity,
          ruleId: scriptRisk.ruleId,
          message: `Lifecycle script "${name}" runs during install`,
          fix: {
            type: "prompt",
            content: "Remove install-time lifecycle hooks, or move the work into an explicit, audited setup command."
          },
          evidence: line
        })
      );
      continue;
    }

    if (section === "dependencies" || section === "devDependencies" || section === "optionalDependencies" || section === "peerDependencies") {
      const sourceRisk = classifyDependencySource(value);
      if (sourceRisk) {
        findings.push(
          createDependencyFinding({
            file,
            line: index + 1,
            column,
            severity: sourceRisk.severity,
            ruleId: sourceRisk.ruleId,
            message: `Dependency "${name}" uses a ${sourceRisk.label} source reference`,
            fix: {
              type: "prompt",
              content: "Replace non-registry dependency references with a pinned registry release and review the lockfile after the change."
            },
            evidence: line
          })
        );
      }

      if (isBroadVersion(value)) {
        findings.push(
          createDependencyFinding({
            file,
            line: index + 1,
            column,
            severity: "medium",
            ruleId: "dependency-broad-version",
            message: `Dependency "${name}" uses a broad or unpinned version range`,
            fix: {
              type: "prompt",
              content: "Pin the dependency to an exact version and update it deliberately through the lockfile."
            },
            evidence: line
          })
        );
      }

      const riskyPackage = RISKY_PACKAGES[name];
      if (riskyPackage) {
        findings.push(
          createDependencyFinding({
            file,
            line: index + 1,
            column,
            severity: riskyPackage.severity,
            ruleId: "dependency-known-risky-package",
            message: `Dependency "${name}" is a ${riskyPackage.reason}`,
            fix: {
              type: "prompt",
              content: "Replace the package with a maintained alternative, or quarantine it behind a review before using it."
            },
            evidence: line
          })
        );
      }

      const typosquat = findTyposquatCandidate(name);
      if (typosquat) {
        findings.push(
          createDependencyFinding({
            file,
            line: index + 1,
            column,
            severity: "medium",
            ruleId: "dependency-typosquat-candidate",
            message: `Dependency "${name}" is suspiciously close to "${typosquat}"`,
            fix: {
              type: "prompt",
              content: "Verify the package spelling against the intended dependency name before installing or publishing."
            },
            evidence: line
          })
        );
      }
    }
  }

  return findings;
}

function scanPackageLock(file: string, contents: string): ScanResult[] {
  const findings: ScanResult[] = [];
  let parsed: unknown;

  try {
    parsed = JSON.parse(contents);
  } catch {
    return findings;
  }

  if (!isRecord(parsed)) {
    return findings;
  }

  if (isRecord(parsed.packages)) {
    for (const [packagePath, value] of Object.entries(parsed.packages)) {
      const packageName = packageNameFromLockPath(packagePath);
      if (packageName) {
        appendPackageNameFindings(findings, file, contents, packagePath, packageName, value);
      }
      if (isRecord(value)) {
        appendResolvedFindings(findings, file, contents, packagePath, value);
      }
    }
  }

  if (isRecord(parsed.dependencies)) {
    for (const [packageName, value] of Object.entries(parsed.dependencies)) {
      appendPackageNameFindings(findings, file, contents, packageName, packageName, value);
      if (isRecord(value)) {
        appendResolvedFindings(findings, file, contents, packageName, value);
      }
    }
  }

  return dedupeFindings(findings);
}

function scanYarnLock(file: string, contents: string): ScanResult[] {
  const findings: ScanResult[] = [];
  const lines = contents.split(/\r?\n/);
  let currentName: string | null = null;

  for (const [index, line] of lines.entries()) {
    const entry = line.match(/^\s*([^#\s][^:]*?)@[^:]+:\s*$/);
    if (entry) {
      currentName = packageNameFromLockKey(entry[1]);
      if (currentName) {
        appendPackageNameFindings(findings, file, contents, line, currentName, currentName);
      }
      continue;
    }

    if (!currentName) {
      continue;
    }

    const sourceFinding = classifySourceLine(line);
    if (sourceFinding) {
      findings.push(
        createDependencyFinding({
          file,
          line: index + 1,
          column: sourceFinding.column,
          severity: sourceFinding.severity,
          ruleId: sourceFinding.ruleId,
          message: `Lockfile entry for "${currentName}" resolves from a ${sourceFinding.label} source`,
          fix: {
            type: "prompt",
            content: "Replace the source reference with a registry-published package version and regenerate the lockfile."
          },
          evidence: line
        })
      );
    }
  }

  return dedupeFindings(findings);
}

function scanPnpmLock(file: string, contents: string): ScanResult[] {
  const findings: ScanResult[] = [];
  const lines = contents.split(/\r?\n/);
  let currentName: string | null = null;

  for (const [index, line] of lines.entries()) {
    const entry = line.match(/^\s{2,}\/?((?:@[^/]+\/)?[^@/:]+)@[^:]+:\s*$/);
    if (entry) {
      currentName = entry[1];
      appendPackageNameFindings(findings, file, contents, line, currentName, currentName);
      continue;
    }

    const sourceFinding = classifySourceLine(line);
    if (currentName && sourceFinding) {
      findings.push(
        createDependencyFinding({
          file,
          line: index + 1,
          column: sourceFinding.column,
          severity: sourceFinding.severity,
          ruleId: sourceFinding.ruleId,
          message: `Lockfile entry for "${currentName}" resolves from a ${sourceFinding.label} source`,
          fix: {
            type: "prompt",
            content: "Use a registry release or a pinned tarball from a trusted source, then review the resulting lockfile diff."
          },
          evidence: line
        })
      );
    }
  }

  return dedupeFindings(findings);
}

function appendPackageNameFindings(
  findings: ScanResult[],
  file: string,
  contents: string,
  lookup: string,
  packageName: string,
  record: unknown
): void {
  const lineInfo = findLineInfo(contents, lookup);
  const riskyPackage = RISKY_PACKAGES[packageName];
  if (riskyPackage) {
    findings.push(
      createDependencyFinding({
        file,
        line: lineInfo.line,
        column: lineInfo.column,
        severity: riskyPackage.severity,
        ruleId: "dependency-known-risky-package",
        message: `Dependency "${packageName}" is a ${riskyPackage.reason}`,
        fix: {
          type: "prompt",
          content: "Replace the package with a maintained alternative, or quarantine it behind a review before using it."
        },
        evidence: lineInfo.lineText
      })
    );
  }

  const typosquat = findTyposquatCandidate(packageName);
  if (typosquat) {
    findings.push(
      createDependencyFinding({
        file,
        line: lineInfo.line,
        column: lineInfo.column,
        severity: "medium",
        ruleId: "dependency-typosquat-candidate",
        message: `Dependency "${packageName}" is suspiciously close to "${typosquat}"`,
        fix: {
          type: "prompt",
          content: "Verify the package spelling against the intended dependency name before installing or publishing."
        },
        evidence: lineInfo.lineText
      })
    );
  }

  if (isRecord(record)) {
    appendResolvedFindings(findings, file, contents, lookup, record);
  }
}

function appendPackageLineFindings(findings: ScanResult[], file: string, line: string, lineNumber: number, packageName: string): void {
  const lineInfo = { line: lineNumber, column: Math.max(line.indexOf(packageName) + 1, 1), lineText: line };
  const riskyPackage = RISKY_PACKAGES[packageName];
  if (riskyPackage) {
    findings.push(
      createDependencyFinding({
        file,
        line: lineInfo.line,
        column: lineInfo.column,
        severity: riskyPackage.severity,
        ruleId: "dependency-known-risky-package",
        message: `Dependency "${packageName}" is a ${riskyPackage.reason}`,
        fix: {
          type: "prompt",
          content: "Replace the package with a maintained alternative, or quarantine it behind a review before using it."
        },
        evidence: lineInfo.lineText
      })
    );
  }

  const typosquat = findTyposquatCandidate(packageName);
  if (typosquat) {
    findings.push(
      createDependencyFinding({
        file,
        line: lineInfo.line,
        column: lineInfo.column,
        severity: "medium",
        ruleId: "dependency-typosquat-candidate",
        message: `Dependency "${packageName}" is suspiciously close to "${typosquat}"`,
        fix: {
          type: "prompt",
          content: "Verify the package spelling against the intended dependency name before installing or publishing."
        },
        evidence: lineInfo.lineText
      })
    );
  }
}

function appendResolvedFindings(findings: ScanResult[], file: string, contents: string, lookup: string, record: Record<string, unknown>): void {
  const resolved = typeof record.resolved === "string" ? record.resolved : null;
  const version = typeof record.version === "string" ? record.version : null;

  for (const candidate of [resolved, version]) {
    if (!candidate) {
      continue;
    }

    const sourceFinding = classifySourceString(candidate, true);
    if (!sourceFinding) {
      continue;
    }

    const lineInfo = findLineInfo(contents, candidate, lookup);
    findings.push(
      createDependencyFinding({
        file,
        line: lineInfo.line,
        column: lineInfo.column,
        severity: sourceFinding.severity,
        ruleId: sourceFinding.ruleId,
        message: `Lockfile entry resolves from a ${sourceFinding.label} source`,
        fix: {
          type: "prompt",
          content: "Replace the source reference with a registry-published package version and regenerate the lockfile."
        },
        evidence: lineInfo.lineText
      })
    );
  }
}

function classifyScript(command: string): { ruleId: string; severity: Severity } {
  const normalized = command.trim();
  const hasRemoteFetch = /\b(?:curl|wget|Invoke-WebRequest|iwr)\b/i.test(normalized) && /\bhttps?:\/\//i.test(normalized);
  const hasShellPipe = /\|\s*(?:sh|bash)\b/i.test(normalized);
  const hasInterpreterEval = /\b(?:node|python|perl|ruby)\b\s+-[ec]\b/i.test(normalized) || /\bnode\s+-e\b/i.test(normalized);
  const hasNetworkOrShell = /\b(?:git\s+clone|npx|npm\s+install|pnpm\s+add|yarn\s+add|powershell|pwsh|bash|sh|cmd)\b/i.test(normalized);

  if (hasRemoteFetch || hasShellPipe) {
    return { ruleId: "dependency-lifecycle-script-dangerous", severity: "critical" };
  }

  if (hasInterpreterEval || hasNetworkOrShell) {
    return { ruleId: "dependency-lifecycle-script-dangerous", severity: "high" };
  }

  return { ruleId: "dependency-lifecycle-script", severity: "medium" };
}

function isLifecycleScript(name: string): boolean {
  return name === "preinstall" || name === "install" || name === "postinstall";
}

function classifyDependencySource(value: string): { ruleId: string; severity: Severity; label: string } | null {
  const source = classifySourceString(value, false);
  return source ? source : null;
}

function classifySourceLine(line: string): { ruleId: string; severity: Severity; label: string; column: number } | null {
  const source = classifySourceString(line, true);
  if (!source) {
    return null;
  }

  const column = findFirstIndex(line, source.label === "http" ? /https?:\/\//i : /(?:git\+|git:\/\/|git@|github:|file:|link:|workspace:)/i);
  return {
    ...source,
    column: column > 0 ? column : 1
  };
}

function classifySourceString(value: string, allowTrustedRegistry = false): { ruleId: string; severity: Severity; label: string } | null {
  if (allowTrustedRegistry && isTrustedRegistrySource(value)) {
    return null;
  }

  for (const pattern of SOURCE_PATTERNS) {
    if (!pattern.pattern.test(value)) {
      continue;
    }

    return {
      ruleId: pattern.ruleId,
      severity: pattern.severity,
      label: pattern.label
    };
  }

  return null;
}

function isTrustedRegistrySource(value: string): boolean {
  return /(?:registry\.npmjs\.org|registry\.yarnpkg\.com|registry\.npm\.taobao\.org)/i.test(value);
}

function isBroadVersion(value: string): boolean {
  const normalized = value.trim();
  if (normalized.length === 0) {
    return true;
  }

  if (normalized === "*" || normalized.toLowerCase() === "latest") {
    return true;
  }

  if (/\b(?:x|X)\b/.test(normalized)) {
    return true;
  }

  return /^[~^><=]|[*]/.test(normalized) || /(?:\s\|\||\|\|)/.test(normalized);
}

function findTyposquatCandidate(name: string): string | null {
  const normalized = normalizePackageName(name);
  if (!normalized || normalized.startsWith("@")) {
    return null;
  }

  let candidate: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const common of COMMON_PACKAGE_NAMES) {
    const distance = levenshtein(normalized, common);
    if (distance === 0 || distance > 2 || distance >= bestDistance) {
      continue;
    }

    bestDistance = distance;
    candidate = common;
  }

  return candidate;
}

function normalizePackageName(name: string): string {
  return name.trim().toLowerCase();
}

function packageNameFromLockPath(lockPath: string): string | null {
  const withoutPrefix = lockPath.replace(/^node_modules\//, "");
  if (!withoutPrefix) {
    return null;
  }

  const normalized = withoutPrefix.replace(/\/node_modules\//g, "/");
  const segments = normalized.split("/");
  if (segments[0]?.startsWith("@") && segments.length >= 2) {
    return `${segments[0]}/${segments[1]}`;
  }

  return segments[segments.length - 1] ?? null;
}

function packageNameFromLockKey(key: string): string | null {
  const firstSpecifier = key.split(",")[0]?.trim();
  if (!firstSpecifier) {
    return null;
  }

  const lastAt = firstSpecifier.lastIndexOf("@");
  if (lastAt <= 0) {
    return firstSpecifier;
  }

  return firstSpecifier.slice(0, lastAt);
}

function findLineInfo(contents: string, needle: string, fallbackNeedle?: string): { line: number; column: number; lineText: string } {
  const lines = contents.split(/\r?\n/);
  const searchTerms = [needle, fallbackNeedle].filter((term): term is string => Boolean(term));

  for (const term of searchTerms) {
    for (const [index, line] of lines.entries()) {
      const column = line.indexOf(term);
      if (column >= 0) {
        return { line: index + 1, column: column + 1, lineText: line };
      }
    }
  }

  return { line: 1, column: 1, lineText: lines[0] ?? "" };
}

function findFirstIndex(line: string, pattern: RegExp): number {
  const match = line.match(pattern);
  return match?.index ?? -1;
}

function createDependencyFinding(params: {
  file: string;
  line: number;
  column: number;
  severity: Severity;
  ruleId: string;
  message: string;
  fix: FixSuggestion;
  evidence: string;
}): ScanResult {
  return {
    id: createFindingId(params.ruleId, params.file, params.line, params.column),
    tool: TOOL_NAME,
    severity: params.severity,
    file: params.file,
    line: params.line,
    column: params.column,
    message: params.message,
    ruleId: params.ruleId,
    fix: params.fix,
    evidence: redactEvidence(params.evidence.trim())
  };
}

function dedupeFindings(findings: ScanResult[]): ScanResult[] {
  const seen = new Set<string>();
  const deduped: ScanResult[] = [];

  for (const finding of findings) {
    if (seen.has(finding.id)) {
      continue;
    }

    seen.add(finding.id);
    deduped.push(finding);
  }

  return deduped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const substitutionCost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + substitutionCost
      );
    }
  }

  return matrix[rows - 1][cols - 1];
}
