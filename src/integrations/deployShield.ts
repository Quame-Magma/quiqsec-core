import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DeployShieldCategory,
  DeployShieldIssue,
  DeployShieldPlatform,
  DeployShieldReport,
  DeployShieldTarget,
  IssueSummary
} from "../types.js";

const REQUIRED_VERCEL_HEADERS = [
  "content-security-policy",
  "x-frame-options",
  "referrer-policy",
  "permissions-policy",
  "x-content-type-options",
  "strict-transport-security"
];

const DIRECT_TARGETS: Array<{ platform: DeployShieldPlatform; file: string; kind: "config" | "migration" }> = [
  { platform: "vercel", file: "vercel.json", kind: "config" },
  { platform: "fly", file: "fly.toml", kind: "config" },
  { platform: "railway", file: "railway.toml", kind: "config" },
  { platform: "supabase", file: path.join("supabase", "config.toml"), kind: "config" }
];

interface DeployShieldOptions {
  applyFixes?: boolean;
}

export async function analyzeDeployShield(root = process.cwd(), options: DeployShieldOptions = {}): Promise<DeployShieldReport> {
  const resolvedRoot = await resolveRoot(root);
  const appliedFixes: string[] = [];

  if (options.applyFixes) {
    appliedFixes.push(...await applyDeployShieldFixes(resolvedRoot));
  }

  const targets: DeployShieldTarget[] = [];
  const issues: DeployShieldIssue[] = [];
  let filesScanned = 0;

  for (const target of DIRECT_TARGETS) {
    const absolute = path.join(resolvedRoot, target.file);
    const exists = await pathExists(absolute);
    targets.push({
      file: toRelativePath(resolvedRoot, absolute),
      platform: target.platform,
      kind: target.kind,
      exists
    });

    if (!exists) {
      continue;
    }

    const text = await readFile(absolute, "utf8");
    filesScanned += 1;
    issues.push(...inspectConfigFile(resolvedRoot, absolute, text, target.platform));
  }

  const migrationsDir = path.join(resolvedRoot, "supabase", "migrations");
  if (await pathExists(migrationsDir)) {
    for (const file of await collectSqlFiles(migrationsDir)) {
      const text = await readFile(file, "utf8");
      filesScanned += 1;
      targets.push({
        file: toRelativePath(resolvedRoot, file),
        platform: "supabase",
        kind: "migration",
        exists: true
      });
      issues.push(...inspectSupabaseMigration(resolvedRoot, file, text));
    }
  }

  const summary = summarizeIssues(issues);

  return {
    generatedAt: new Date().toISOString(),
    root: resolvedRoot,
    filesScanned,
    targets,
    issues: sortIssues(issues),
    summary,
    blocked: summary.critical > 0 || summary.high > 2,
    appliedFixes
  };
}

async function applyDeployShieldFixes(root: string): Promise<string[]> {
  const applied: string[] = [];
  const vercelFile = path.join(root, "vercel.json");
  const supabaseFile = path.join(root, "supabase", "config.toml");

  if (await pathExists(vercelFile)) {
    const text = await readFile(vercelFile, "utf8");
    const updated = applyVercelHeaderFixes(text);
    if (updated !== text) {
      await writeFile(vercelFile, updated, "utf8");
      applied.push("vercel.json: added missing security headers block");
    }
  }

  if (await pathExists(supabaseFile)) {
    const text = await readFile(supabaseFile, "utf8");
    const updated = applySupabaseSiteUrlFix(text);
    if (updated !== text) {
      await writeFile(supabaseFile, updated, "utf8");
      applied.push("supabase/config.toml: upgraded site_url to https");
    }
  }

  return applied;
}

function applyVercelHeaderFixes(text: string): string {
  const parsed = tryParseJson(text);
  if (!isRecord(parsed)) {
    return text;
  }

  const copy = { ...parsed };
  const headers = Array.isArray(copy["headers"]) ? [...copy["headers"]] : [];
  const source = "/(.*)";
  let entry = headers.find((item) => isRecord(item) && item["source"] === source);

  if (!entry || !isRecord(entry)) {
    entry = { source, headers: [] };
    headers.push(entry);
  }

  const existing = Array.isArray(entry["headers"]) ? [...entry["headers"]] : [];
  const present = new Set<string>();
  for (const item of existing) {
    if (isRecord(item) && typeof item["key"] === "string") {
      present.add(item["key"].toLowerCase());
    }
  }

  const defaults: Array<{ key: string; value: string }> = [
    { key: "Content-Security-Policy", value: "default-src 'self'" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }
  ];

  for (const header of defaults) {
    if (!present.has(header.key.toLowerCase())) {
      existing.push(header);
    }
  }

  entry["headers"] = existing;
  copy["headers"] = headers;
  return `${JSON.stringify(copy, null, 2)}\n`;
}

function applySupabaseSiteUrlFix(text: string): string {
  const updated = text.replace(/site_url\s*=\s*["']http:\/\/([^"']+)["']/i, 'site_url = "https://$1"');
  return updated;
}

async function resolveRoot(root: string): Promise<string> {
  const absolute = path.resolve(root);
  try {
    const info = await stat(absolute);
    return info.isDirectory() ? absolute : path.dirname(absolute);
  } catch {
    return absolute;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function collectSqlFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const entries = await readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const absolute = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await collectSqlFiles(absolute));
      continue;
    }

    if (entry.isFile() && entry.name.toLowerCase().endsWith(".sql")) {
      files.push(absolute);
    }
  }

  return files;
}

function inspectConfigFile(root: string, filePath: string, text: string, platform: DeployShieldPlatform): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];
  const relative = toRelativePath(root, filePath);

  if (platform === "vercel") {
    issues.push(...inspectVercelConfig(relative, text));
  }

  if (platform === "fly") {
    issues.push(...inspectFlyConfig(relative, text));
  }

  if (platform === "railway") {
    issues.push(...inspectRailwayConfig(relative, text));
  }

  if (platform === "supabase") {
    issues.push(...inspectSupabaseConfig(relative, text));
  }

  issues.push(...findSecretAssignments(relative, text, platform));
  return issues;
}

function inspectVercelConfig(file: string, text: string): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];
  const json = tryParseJson(text);

  const headerEntries = isRecord(json) && Array.isArray(json["headers"]) ? json["headers"] : [];

  if (headerEntries.length === 0) {
    issues.push(createIssue({
      platform: "vercel",
      file,
      severity: "medium",
      category: "security_headers",
      title: "Missing Vercel security headers",
      description: "No `headers` block was found in the Vercel config.",
      evidence: "headers block missing",
      recommendation: "Add a `headers` section with CSP, frame, referrer, and HSTS protections."
    }));
    return issues;
  }

  const present = new Set<string>();
  for (const entry of headerEntries) {
    const headers = isRecord(entry) && Array.isArray(entry["headers"]) ? entry["headers"] : [];
    for (const header of headers) {
      const name = isRecord(header) && typeof header["key"] === "string" ? header["key"].toLowerCase() : "";
      if (name) {
        present.add(name);
      }
    }
  }

  const missing = REQUIRED_VERCEL_HEADERS.filter((header) => !present.has(header));
  if (missing.length > 0) {
    issues.push(createIssue({
      platform: "vercel",
      file,
      severity: missing.length > 3 ? "high" : "medium",
      category: "security_headers",
      title: "Incomplete Vercel security headers",
      description: `Missing headers: ${missing.join(", ")}.`,
      evidence: missing.join(", "),
      recommendation: "Add the missing headers to the Vercel config before deploy."
    }));
  }

  return issues;
}

function inspectFlyConfig(file: string, text: string): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];

  if (/(\[\[services\]\]|\[http_service\])/i.test(text) && !/force_https\s*=\s*true/i.test(text)) {
    issues.push(createIssue({
      platform: "fly",
      file,
      severity: "medium",
      category: "security_headers",
      title: "Fly service does not enforce HTTPS",
      description: "Fly service blocks were found without `force_https = true`.",
      evidence: findText(text, /force_https\s*=\s*true/i) ?? "force_https = true missing",
      recommendation: "Enable HTTPS enforcement for Fly HTTP services."
    }));
  }

  return issues;
}

function inspectRailwayConfig(file: string, text: string): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];

  if (!/variables\s*=\s*\{[^}]*\}/is.test(text) && !/env\s*=\s*\{[^}]*\}/is.test(text)) {
    issues.push(createIssue({
      platform: "railway",
      file,
      severity: "low",
      category: "env_placeholder",
      title: "Railway config has no environment mapping",
      description: "No explicit environment mapping block was detected.",
      evidence: "environment block missing",
      recommendation: "Use env placeholders for secrets and project-specific values."
    }));
  }

  return issues;
}

function inspectSupabaseConfig(file: string, text: string): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];
  const siteUrlMatch = text.match(/site_url\s*=\s*["']([^"']+)["']/i);

  if (siteUrlMatch && /^http:\/\//i.test(siteUrlMatch[1])) {
    issues.push(createIssue({
      platform: "supabase",
      file,
      severity: "medium",
      category: "security_headers",
      title: "Supabase site URL is not secure",
      description: "The configured `site_url` uses HTTP instead of HTTPS.",
      evidence: siteUrlMatch[1],
      recommendation: "Use the production HTTPS origin for `site_url`."
    }));
  }

  return issues;
}

function inspectSupabaseMigration(root: string, filePath: string, text: string): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];
  const relative = toRelativePath(root, filePath);
  const hasCreateTable = /create\s+table/i.test(text);
  const hasRlsEnable = /enable\s+row\s+level\s+security/i.test(text);
  const hasPolicy = /create\s+policy/i.test(text);

  if (hasCreateTable && !hasRlsEnable) {
    issues.push(createIssue({
      platform: "supabase",
      file: relative,
      severity: hasPolicy ? "medium" : "high",
      category: "supabase_rls",
      title: "Supabase table is created without an RLS hint",
      description: "The migration creates a table but does not enable row level security.",
      evidence: findText(text, /create\s+table[\s\S]{0,240}/i) ?? "create table ...",
      recommendation: "Add `alter table ... enable row level security;` and explicit policies."
    }));
  }

  if (hasCreateTable && !hasPolicy) {
    issues.push(createIssue({
      platform: "supabase",
      file: relative,
      severity: "medium",
      category: "supabase_rls",
      title: "Supabase migration has no policy definition",
      description: "Table creation was found without a matching `create policy` statement.",
      evidence: findText(text, /create\s+table[\s\S]{0,240}/i) ?? "create table ...",
      recommendation: "Add RLS policies for the table before exposing it to clients."
    }));
  }

  return issues;
}

function findSecretAssignments(file: string, text: string, platform: DeployShieldPlatform): DeployShieldIssue[] {
  const issues: DeployShieldIssue[] = [];
  const patterns = [
    /["']?([A-Z0-9_.-]*(?:SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY|ACCESS_KEY|CREDENTIAL|JWT_SECRET|DATABASE_URL)[A-Z0-9_.-]*)["']?\s*[:=]\s*(["'])([^"']+)\2/gi
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text))) {
      const key = match[1];
      const value = match[3];
      const line = lineNumberAt(text, match.index);

      if (isPlaceholderValue(value)) {
        continue;
      }

      const severity = looksLikeSecretValue(value) ? "critical" : "high";
      issues.push(createIssue({
        platform,
        file,
        line,
        severity,
        category: "public_secret",
        title: `Hardcoded secret-like value in ${key}`,
        description: "A secret-like config value is committed as a literal string.",
        evidence: `${key} = ${redactValue(value)}`,
        recommendation: "Replace the literal with an environment placeholder or secret manager reference."
      }));
    }
  }

  return issues;
}

function createIssue(input: Omit<DeployShieldIssue, "id">): DeployShieldIssue {
  return {
    id: createIssueId(input.platform, input.file, input.line, input.category, input.title),
    ...input
  };
}

function createIssueId(
  platform: DeployShieldPlatform,
  file: string,
  line: number | undefined,
  category: DeployShieldCategory,
  title: string
): string {
  return createHash("sha1")
    .update([platform, file, line ?? 0, category, title].join("|"))
    .digest("hex")
    .slice(0, 16);
}

function summarizeIssues(issues: DeployShieldIssue[]): IssueSummary {
  return issues.reduce<IssueSummary>((summary, issue) => {
    summary[issue.severity] += 1;
    return summary;
  }, {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0
  });
}

function sortIssues(issues: DeployShieldIssue[]): DeployShieldIssue[] {
  const order: Record<DeployShieldIssue["severity"], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3
  };

  return [...issues].sort((left, right) => {
    const delta = order[left.severity] - order[right.severity];
    if (delta !== 0) {
      return delta;
    }

    return `${left.file}:${left.line ?? 0}:${left.category}`.localeCompare(`${right.file}:${right.line ?? 0}:${right.category}`);
  });
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlaceholderValue(value: string): boolean {
  return /^(?:<[^>]+>|\$\{[^}]+\}|REPLACE_ME|CHANGE_ME|CHANGEME|TODO|FIXME|YOUR_[A-Z0-9_]+)$/i.test(value.trim()) || /process\.env/i.test(value);
}

function looksLikeSecretValue(value: string): boolean {
  return (
    /^-----BEGIN [A-Z ]+PRIVATE KEY-----/.test(value) ||
    /AKIA[0-9A-Z]{16}/.test(value) ||
    /^eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9._-]{10,}\.[a-zA-Z0-9._-]{10,}$/.test(value) ||
    /^[A-Za-z0-9+/=_-]{40,}$/.test(value)
  );
}

function redactValue(value: string): string {
  if (value.length <= 8) {
    return "***";
  }

  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split(/\r?\n/).length;
}

function findText(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  return match ? match[0].replace(/\s+/g, " ").trim() : undefined;
}

function toRelativePath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/");
}
