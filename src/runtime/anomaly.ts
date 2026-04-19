import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
import type { RuntimeAnalysisReport, RuntimeAnomaly, Severity } from "../types.js";
import { saveRuntimeReport } from "../storage.js";

interface RuntimeSignal {
  key: string;
  severity: Severity;
  title: string;
  description: string;
  recommendation: string;
  pattern: RegExp;
  threshold: number;
}

const signals: RuntimeSignal[] = [
  {
    key: "server-errors",
    severity: "high",
    title: "Elevated server errors",
    description: "5xx responses or server exceptions appear repeatedly in runtime logs.",
    recommendation: "Inspect recent deploys, add structured error handling, and check upstream dependency health.",
    pattern: /\b(5\d\d|error|exception|stack trace|unhandled)\b/i,
    threshold: 5
  },
  {
    key: "auth-failures",
    severity: "high",
    title: "Authentication failure burst",
    description: "Repeated auth failures can indicate brute-force or credential-stuffing activity.",
    recommendation: "Apply rate limits, lockout controls, MFA prompts, and alerting on auth endpoints.",
    pattern: /\b(login failed|invalid password|unauthorized|401|403|brute|credential)\b/i,
    threshold: 8
  },
  {
    key: "suspicious-paths",
    severity: "critical",
    title: "Suspicious probing paths",
    description: "Logs include common exploit, traversal, or admin probing paths.",
    recommendation: "Block the source, verify routing rules, and review exposed admin/debug endpoints.",
    pattern: /(\.\.\/|\/wp-admin|\/phpmyadmin|\/\.env|\/admin|\/debug|select\+|union\+select|<script)/i,
    threshold: 2
  },
  {
    key: "rate-limit",
    severity: "medium",
    title: "Rate-limit pressure",
    description: "Runtime logs show throttling or too-many-request behavior.",
    recommendation: "Review client patterns and ensure rate limits protect auth and write-heavy endpoints.",
    pattern: /\b(429|rate limit|too many requests|throttled)\b/i,
    threshold: 4
  },
  {
    key: "secret-output",
    severity: "critical",
    title: "Possible secret in runtime output",
    description: "Runtime logs appear to contain credentials, API keys, or sensitive tokens.",
    recommendation: "Rotate exposed credentials, redact logs, and audit telemetry sinks immediately.",
    pattern: /(AKIA[0-9A-Z]{16}|sk-[A-Za-z0-9_-]{20,}|password=|secret=|token=)/i,
    threshold: 1
  }
];

export async function analyzeRuntimeLog(filePath: string, cwd = process.cwd()): Promise<RuntimeAnalysisReport> {
  const raw = await readFile(filePath, "utf8");
  const lines = raw.split(/\r?\n/);
  const anomalies = signals
    .map((signal) => analyzeSignal(signal, lines))
    .filter((anomaly): anomaly is RuntimeAnomaly => Boolean(anomaly));

  const report: RuntimeAnalysisReport = {
    generatedAt: new Date().toISOString(),
    source: filePath,
    linesAnalyzed: lines.filter(Boolean).length,
    anomalies,
    blocked: anomalies.some((anomaly) => anomaly.severity === "critical" || anomaly.severity === "high")
  };

  await saveRuntimeReport(report, cwd);
  return report;
}

function analyzeSignal(signal: RuntimeSignal, lines: string[]): RuntimeAnomaly | null {
  const matches = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => signal.pattern.test(line));

  if (matches.length < signal.threshold) {
    return null;
  }

  const first = matches[0];

  return {
    id: crypto.createHash("sha1").update(`${signal.key}:${first.index}:${matches.length}`).digest("hex").slice(0, 16),
    severity: signal.severity,
    title: signal.title,
    description: signal.description,
    evidence: redactRuntimeEvidence(first.line.trim()),
    recommendation: signal.recommendation,
    count: matches.length
  };
}

function redactRuntimeEvidence(line: string): string {
  return line
    .replace(/AKIA[0-9A-Z]{16}/g, "AKIA****************")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-********")
    .replace(/(password|secret|token)=([^&\s]+)/gi, "$1=********");
}
