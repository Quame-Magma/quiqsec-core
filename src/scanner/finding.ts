import crypto from "node:crypto";

export function createFindingId(ruleId: string, file: string, line: number, column: number): string {
  return crypto
    .createHash("sha1")
    .update(`${ruleId}:${file}:${line}:${column}`)
    .digest("hex")
    .slice(0, 16);
}

export function redactEvidence(line: string): string {
  return line
    .replace(/AKIA[0-9A-Z]{16}/g, "AKIA****************")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-********")
    .replace(/\bsk_(?:live|test)_[A-Za-z0-9]{8,}\b/g, "sk_********")
    .replace(/(password\s*[:=]\s*['"])[^'"]+(['"])/gi, "$1********$2");
}
