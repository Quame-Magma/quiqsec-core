import type { Rule, ScanResult } from "../types.js";
import { createFindingId, redactEvidence } from "./finding.js";

const TOOL_NAME = "QuiqSecRuleEngine";

export function scanTextWithRules(file: string, contents: string, rules: Rule[]): ScanResult[] {
  const findings: ScanResult[] = [];
  const lines = contents.split(/\r?\n/);

  for (const rule of rules) {
    const regex = compileRule(rule);
    if (!regex) {
      continue;
    }

    for (const [index, line] of lines.entries()) {
      const match = regex.exec(line);
      if (!match) {
        continue;
      }

      findings.push({
        id: createFindingId(rule.id, file, index + 1, match.index + 1),
        tool: TOOL_NAME,
        severity: rule.severity,
        file,
        line: index + 1,
        column: match.index + 1,
        message: rule.description,
        ruleId: rule.id,
        fix: {
          type: "prompt",
          content: rule.fixTemplate
        },
        evidence: redactEvidence(line.trim())
      });
    }
  }

  return findings;
}

function compileRule(rule: Rule): RegExp | null {
  try {
    return new RegExp(rule.pattern, "i");
  } catch {
    return null;
  }
}
