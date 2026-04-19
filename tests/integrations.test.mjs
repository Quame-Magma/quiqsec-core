import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { main } from "../dist/cli/index.js";
import { analyzeDeployShield, buildIntegrationReport } from "../dist/integrations/index.js";

function captureStdout() {
  const originalWrite = process.stdout.write.bind(process.stdout);
  let buffer = "";

  process.stdout.write = (chunk, encoding, callback) => {
    buffer += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString(typeof encoding === "string" ? encoding : undefined);
    if (typeof callback === "function") {
      callback();
    }

    return true;
  };

  return () => {
    process.stdout.write = originalWrite;
    return buffer;
  };
}

test("integration templates include local MCP snippets for supported editors", () => {
  const report = buildIntegrationReport("/workspace/quiqsec");

  assert.equal(report.templates.length, 5);
  assert.equal(report.templates.some((template) => template.id === "cursor"), true);
  assert.equal(report.templates.some((template) => template.id === "claude_code"), true);
  assert.equal(report.templates.some((template) => template.id === "vscode"), true);
  assert.equal(report.templates.some((template) => template.id === "continue"), true);
  assert.equal(report.templates.some((template) => template.id === "windsurf"), true);
  assert.match(report.templates[0].content, /"mcpServers"/);
  assert.match(report.templates[0].content, /dist\/server\/index\.js/);
});

test("integrations command prints JSON for MCP config templates", async () => {
  const restore = captureStdout();

  try {
    const code = await main(["integrations", "--format=json"]);
    const output = restore();

    assert.equal(code, 0);
    const payload = JSON.parse(output);
    assert.equal(payload.templates.length, 5);
    assert.equal(payload.templates.every((template) => typeof template.content === "string"), true);
  } finally {
    restore();
  }
});

test("setup command writes MCP config and doctor validates interception wiring", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-setup-"));
  const previousCwd = process.cwd();

  try {
    process.chdir(dir);
    let restore = captureStdout();
    const setupCode = await main(["setup", "--ide=vscode"]);
    const setupOutput = restore();
    assert.equal(setupCode, 0);
    assert.match(setupOutput, /"mode": "setup"/);

    const configPath = path.join(dir, ".vscode", "mcp.json");
    const raw = await readFile(configPath, "utf8");
    assert.match(raw, /"quiqsec"/);
    assert.match(setupOutput, /"healthy": true/);

    restore = captureStdout();
    const doctorCode = await main(["integrations", "doctor", "--ide=vscode"]);
    const doctorOutput = restore();
    assert.equal(doctorCode, 0);
    assert.match(doctorOutput, /"mode": "doctor"/);
    assert.match(doctorOutput, /"healthy": true/);
  } finally {
    process.chdir(previousCwd);
  }
});

test("deploy shield detects insecure config, public secrets, and Supabase RLS gaps", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-deploy-"));
  await mkdir(path.join(dir, "supabase", "migrations"), { recursive: true });
  const awsLikeKey = "AKIA" + "ABCDEFGHIJKLMNOP";
  const flyPassword = "super" + "secret" + "value";

  await writeFile(path.join(dir, "vercel.json"), JSON.stringify({
    env: {
      VERCEL_API_KEY: awsLikeKey
    }
  }, null, 2));

  await writeFile(path.join(dir, "fly.toml"), [
    "[http_service]",
    "force_https = false",
    "",
    "[env]",
    'PASSWORD = "' + flyPassword + '"',
    ""
  ].join("\n"));

  await writeFile(path.join(dir, "railway.toml"), [
    "[deploy]",
    "startCommand = \"npm run start\"",
    ""
  ].join("\n"));

  await writeFile(path.join(dir, "supabase", "config.toml"), 'site_url = "http://localhost:3000"\n');

  await writeFile(path.join(dir, "supabase", "migrations", "001_init.sql"), [
    "create table public.users (",
    "  id bigint primary key",
    ");",
    ""
  ].join("\n"));

  const report = await analyzeDeployShield(dir);

  assert.equal(report.blocked, true);
  assert.equal(report.summary.critical > 0, true);
  assert.equal(report.issues.some((issue) => issue.platform === "vercel" && issue.category === "security_headers"), true);
  assert.equal(report.issues.some((issue) => issue.platform === "vercel" && issue.category === "public_secret"), true);
  assert.equal(report.issues.some((issue) => issue.platform === "supabase" && issue.category === "supabase_rls"), true);
  assert.equal(report.issues.some((issue) => issue.platform === "fly" && issue.category === "security_headers"), true);
});

test("deploy command prints JSON and blocks on findings", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-deploy-cli-"));
  await writeFile(path.join(dir, "vercel.json"), JSON.stringify({
    env: {
      SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaaaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbbbbbb"
    }
  }, null, 2));

  const restore = captureStdout();

  try {
    const code = await main(["deploy", dir, "--format=json"]);
    const output = restore();

    assert.equal(code, 1);
    const payload = JSON.parse(output);
    assert.equal(payload.blocked, true);
    assert.equal(payload.issues.length > 0, true);
    assert.equal(payload.targets.some((target) => target.file === "vercel.json"), true);
  } finally {
    restore();
  }
});
