import type { HealthReport, IssueSummary, ScanResult } from "./types.js";

export const BLOCKING_HIGH_THRESHOLD = 2;

const severityWeights: IssueSummary = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 1
};

export function emptyIssueSummary(): IssueSummary {
  return {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  };
}

export function countIssues(findings: ScanResult[]): IssueSummary {
  const summary = emptyIssueSummary();

  for (const finding of findings) {
    summary[finding.severity] += 1;
  }

  return summary;
}

export function calculateHealthScore(summary: IssueSummary): number {
  const score =
    100 -
    summary.critical * severityWeights.critical -
    summary.high * severityWeights.high -
    summary.medium * severityWeights.medium -
    summary.low * severityWeights.low;

  return Math.max(0, Math.min(100, score));
}

export function shouldBlock(summary: IssueSummary): boolean {
  return summary.critical > 0 || summary.high > BLOCKING_HIGH_THRESHOLD;
}

export function createHealthReport(findings: ScanResult[], scannedAt = new Date().toISOString()): HealthReport {
  const issues = countIssues(findings);

  return {
    healthScore: calculateHealthScore(issues),
    issues,
    lastScan: scannedAt
  };
}
