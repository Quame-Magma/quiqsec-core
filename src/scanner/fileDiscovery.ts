import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const ignoredSegments = new Set(["node_modules", ".git", "dist", ".quiqsec", "coverage"]);
const scannableExtensions = new Set([
  ".cjs",
  ".css",
  ".env",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".mjs",
  ".ts",
  ".tsx",
  ".vue",
  ".yml",
  ".yaml"
]);

export async function discoverFiles(inputPaths: string[], cwd = process.cwd(), excludePatterns: string[] = []): Promise<string[]> {
  const roots = inputPaths.length > 0 ? inputPaths : ["."];
  const files: string[] = [];

  for (const inputPath of roots) {
    const absolutePath = path.resolve(cwd, inputPath);
    await collectFiles(absolutePath, files, cwd, excludePatterns, true);
  }

  return Array.from(new Set(files)).sort();
}

async function collectFiles(
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
    await Promise.all(entries.map((entry) => collectFiles(path.join(absolutePath, entry), files, cwd, excludePatterns)));
    return;
  }

  if (info.isFile() && isScannableFile(absolutePath)) {
    files.push(absolutePath);
  }
}

function isIgnoredPath(absolutePath: string, cwd: string, excludePatterns: string[]): boolean {
  const baseName = path.basename(absolutePath);
  if ((baseName.startsWith("quiqsec-") && baseName.endsWith(".json")) || baseName.endsWith(".sarif")) {
    return true;
  }

  const ignoredBySegment = absolutePath
    .split(path.sep)
    .some((segment) => ignoredSegments.has(segment));

  if (ignoredBySegment) {
    return true;
  }

  const reportPath = toReportPath(absolutePath, cwd);
  return excludePatterns.some((pattern) => reportPath === pattern || reportPath.startsWith(`${pattern}/`));
}

function isScannableFile(filePath: string): boolean {
  const extension = path.extname(filePath);
  const baseName = path.basename(filePath);

  return scannableExtensions.has(extension) || baseName.startsWith(".env");
}

export function toReportPath(filePath: string, cwd = process.cwd()): string {
  return path.relative(cwd, filePath).split(path.sep).join("/");
}
