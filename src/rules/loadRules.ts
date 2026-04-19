import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Rule, Severity } from "../types.js";
import { stripBom } from "../config.js";

const builtinRulesPath = fileURLToPath(new URL("../../rules/base-rules.json", import.meta.url));
const validSeverities = new Set<Severity>(["low", "medium", "high", "critical"]);

export async function loadRules(cwd = process.cwd(), configuredPaths: string[] = []): Promise<Rule[]> {
  const ruleFiles = [builtinRulesPath, ...configuredPaths.map((rulePath) => path.resolve(cwd, rulePath))];
  const ruleSets = await Promise.all(ruleFiles.map((ruleFile) => loadRuleFile(ruleFile)));
  const rulesById = new Map<string, Rule>();

  for (const rule of ruleSets.flat()) {
    rulesById.set(rule.id, rule);
  }

  return Array.from(rulesById.values());
}

async function loadRuleFile(filePath: string): Promise<Rule[]> {
  const raw = stripBom(await readFile(filePath, "utf8"));
  const parsed = JSON.parse(raw) as unknown;

  if (!Array.isArray(parsed)) {
    throw new Error(`Rule file must contain an array: ${filePath}`);
  }

  return parsed.map((value, index) => parseRule(value, `${filePath}[${index}]`));
}

function parseRule(value: unknown, location: string): Rule {
  if (!isRecord(value)) {
    throw new Error(`Rule must be an object: ${location}`);
  }

  const id = requireString(value, "id", location);
  const description = requireString(value, "description", location);
  const pattern = requireString(value, "pattern", location);
  const severity = requireSeverity(value, location);
  const fixTemplate = requireString(value, "fixTemplate", location);

  validateRegex(pattern, location);

  return {
    id,
    description,
    pattern,
    severity,
    fixTemplate,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string") : undefined
  };
}

function requireString(value: Record<string, unknown>, key: string, location: string): string {
  const field = value[key];
  if (typeof field !== "string" || field.trim().length === 0) {
    throw new Error(`Rule field ${key} must be a non-empty string: ${location}`);
  }

  return field;
}

function requireSeverity(value: Record<string, unknown>, location: string): Severity {
  const severity = value.severity;
  if (severity !== "low" && severity !== "medium" && severity !== "high" && severity !== "critical") {
    throw new Error(`Rule severity must be one of ${Array.from(validSeverities).join(", ")}: ${location}`);
  }

  return severity;
}

function validateRegex(pattern: string, location: string): void {
  try {
    new RegExp(pattern, "i");
  } catch (error) {
    throw new Error(`Invalid regex in rule ${location}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
