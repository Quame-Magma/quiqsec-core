import test from "node:test";
import assert from "node:assert/strict";
import { renderSarif } from "../dist/reporters/sarif.js";

test("SARIF reporter emits version and result locations", () => {
  const sarif = JSON.parse(renderSarif({
    generatedAt: "2026-04-17T00:00:00.000Z",
    root: process.cwd(),
    filesScanned: 1,
    summary: { critical: 0, high: 1, medium: 0, low: 0 },
    healthReport: {
      healthScore: 90,
      issues: { critical: 0, high: 1, medium: 0, low: 0 },
      lastScan: "2026-04-17T00:00:00.000Z"
    },
    blocked: false,
    findings: [
      {
        id: "abc",
        tool: "QuiqSecRuleEngine",
        severity: "high",
        file: "src/app.js",
        line: 10,
        column: 5,
        message: "Unsafe innerHTML assignment",
        ruleId: "no-xss-innerhtml",
        fix: { type: "prompt", content: "Use textContent." }
      }
    ]
  }));

  assert.equal(sarif.version, "2.1.0");
  assert.equal(sarif.runs[0].results[0].locations[0].physicalLocation.artifactLocation.uri, "src/app.js");
});
