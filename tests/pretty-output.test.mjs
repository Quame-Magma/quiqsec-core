import test from "node:test";
import assert from "node:assert/strict";
import { renderPrettyScan } from "../dist/cli/ui.js";

test("pretty scan output summarizes pass state", () => {
  const output = renderPrettyScan({
    generatedAt: "2026-04-17T00:00:00.000Z",
    root: process.cwd(),
    filesScanned: 3,
    findings: [],
    summary: { critical: 0, high: 0, medium: 0, low: 0 },
    healthReport: {
      healthScore: 100,
      issues: { critical: 0, high: 0, medium: 0, low: 0 },
      lastScan: "2026-04-17T00:00:00.000Z"
    },
    blocked: false
  }, false);

  assert.match(output, /QuiqSec Scan/);
  assert.match(output, /Status: PASS/);
  assert.match(output, /No findings/);
});

test("pretty scan output lists blocking findings", () => {
  const output = renderPrettyScan({
    generatedAt: "2026-04-17T00:00:00.000Z",
    root: process.cwd(),
    filesScanned: 1,
    findings: [
      {
        id: "abc",
        tool: "QuiqSecRuleEngine",
        severity: "critical",
        file: "src/app.js",
        line: 12,
        column: 7,
        message: "Hardcoded secret",
        ruleId: "hardcoded-secret",
        fix: { type: "prompt", content: "Move the secret to a secret manager." },
        evidence: "const secret = \"********\";"
      }
    ],
    summary: { critical: 1, high: 0, medium: 0, low: 0 },
    healthReport: {
      healthScore: 80,
      issues: { critical: 1, high: 0, medium: 0, low: 0 },
      lastScan: "2026-04-17T00:00:00.000Z"
    },
    blocked: true
  }, false);

  assert.match(output, /Status: BLOCKED/);
  assert.match(output, /hardcoded-secret/);
  assert.match(output, /Action required before deploy/);
});
