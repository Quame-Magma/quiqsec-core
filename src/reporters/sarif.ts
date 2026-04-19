import type { ScanReport, ScanResult } from "../types.js";

export function renderSarif(report: ScanReport): string {
  const rulesById = new Map<string, ScanResult>();

  for (const finding of report.findings) {
    if (!rulesById.has(finding.ruleId)) {
      rulesById.set(finding.ruleId, finding);
    }
  }

  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "QuiqSec",
            rules: Array.from(rulesById.values()).map((finding) => ({
              id: finding.ruleId,
              name: finding.ruleId,
              shortDescription: {
                text: finding.message
              },
              defaultConfiguration: {
                level: sarifLevel(finding)
              },
              properties: {
                severity: finding.severity
              }
            }))
          }
        },
        results: report.findings.map((finding) => ({
          ruleId: finding.ruleId,
          level: sarifLevel(finding),
          message: {
            text: finding.message
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri: finding.file
                },
                region: {
                  startLine: finding.line,
                  startColumn: finding.column
                }
              }
            }
          ],
          properties: {
            severity: finding.severity,
            fix: finding.fix.content
          }
        }))
      }
    ]
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function sarifLevel(finding: ScanResult): "error" | "warning" | "note" {
  if (finding.severity === "critical" || finding.severity === "high") {
    return "error";
  }

  if (finding.severity === "medium") {
    return "warning";
  }

  return "note";
}
