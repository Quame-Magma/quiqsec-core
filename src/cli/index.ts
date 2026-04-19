#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { initProject, loadConfig, saveConfig } from "../config.js";
import { createSnapshot, previewRollback, restoreSnapshot } from "../git.js";
import { shouldBlock } from "../policy.js";
import { renderJson } from "../reporters/json.js";
import { renderSarif } from "../reporters/sarif.js";
import { scanPaths } from "../scanner/index.js";
import { readLastReport } from "../storage.js";
import { readWorkspace, saveWorkspace } from "../storage.js";
import { buildGuardrailPrompt } from "../prompt/buildGuardrail.js";
import { verifyPromptOutput } from "../prompt/verifyIntent.js";
import { analyzeRuntimeLog } from "../runtime/anomaly.js";
import { analyzeDeployShield, buildIntegrationReport, diagnoseMcpIntegrations, setupMcpIntegrations } from "../integrations/index.js";
import { exchangeDeviceCode, setCloudEnabled, setCloudEndpoint, setCloudToken, syncLatestReportToCloud } from "../cloud/index.js";
import { startDashboardServer } from "../dashboard/server.js";
import {
  renderPrettyDeploy,
  renderPrettyIntegrations,
  renderPrettyGuardrail,
  renderPrettyHealth,
  renderPrettyRuntime,
  renderPrettyScan,
  renderPrettyVerification,
  Spinner
} from "./ui.js";

type OutputFormat = "pretty" | "json" | "sarif";

interface ParsedArgs {
  paths: string[];
  format: OutputFormat;
  output?: string;
  prompt?: string;
  promptFile?: string;
  logs?: string;
  port?: number;
  yes: boolean;
  dryRun: boolean;
  apply: boolean;
  semgrep: boolean;
  gitleaks: boolean;
  timeoutMs?: number;
  token?: string;
  endpoint?: string;
  deviceCode?: string;
  name?: string;
  role?: "owner" | "admin" | "developer" | "viewer";
  email?: string;
  memberId?: string;
  ide?: "auto" | "cursor" | "claude_code" | "vscode" | "continue" | "windsurf";
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const [command = "help", ...args] = argv;

  try {
    switch (command) {
      case "init":
        await initProject();
        console.log("QuiqSec initialized in .quiqsec/");
        return 0;
      case "scan":
        return await runScan(args);
      case "guard":
        return await runGuard(args);
      case "verify":
        return await runVerify(args);
      case "runtime":
        return await runRuntime(args);
      case "dashboard":
        return await runDashboard(args);
      case "integrations":
        return await runIntegrations(args);
      case "setup":
        return await runSetup(args);
      case "deploy":
        return await runDeploy(args);
      case "cloud":
        return await runCloud(args);
      case "team":
        return await runTeam(args);
      case "report":
        return await runReport(args);
      case "snapshot":
        return await runSnapshot();
      case "rollback":
        return await runRollback(args);
      case "help":
      case "--help":
      case "-h":
        printHelp();
        return 0;
      default:
        console.error(`Unknown command: ${command}`);
        printHelp();
        return 2;
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
}

async function runDashboard(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const diagnostics = await diagnoseMcpIntegrations({ ide: parsed.ide ?? "auto" });
  if (!diagnostics.healthy) {
    console.error("MCP interception diagnostics failed. Run `quiqsec setup --ide=auto --repair` and retry.");
    for (const result of diagnostics.results.filter((item) => item.status === "error")) {
      console.error(`- ${result.id}: ${result.message}`);
    }
    return 2;
  }

  const handle = await startDashboardServer({ port: parsed.port });
  console.log(`QuiqSec dashboard running at ${handle.url}`);
  console.log("Press Ctrl+C to stop.");

  await new Promise<void>((resolve) => {
    const stop = () => {
      handle.server.close(() => resolve());
    };
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  return 0;
}

async function runRuntime(args: string[]): Promise<number> {
  const parsed = parseArgs(args);

  if (!parsed.logs) {
    console.error("`quiqsec runtime` requires --logs path.");
    return 2;
  }

  if (parsed.format === "sarif") {
    console.error("`quiqsec runtime` supports --format=pretty or --format=json.");
    return 2;
  }

  const report = await analyzeRuntimeLog(parsed.logs);
  const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderPrettyRuntime(report);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return report.blocked ? 1 : 0;
}

async function runIntegrations(args: string[]): Promise<number> {
  const hasSubcommand = typeof args[0] === "string" && !args[0].startsWith("-");
  const subcommand = hasSubcommand ? args[0] : "templates";
  const rest = hasSubcommand ? args.slice(1) : args;
  const parsed = parseArgs(rest);

  if (subcommand === "doctor") {
    const report = await diagnoseMcpIntegrations({ ide: parsed.ide ?? "auto" });
    console.log(JSON.stringify(report, null, 2));
    return report.healthy ? 0 : 1;
  }

  if (subcommand === "repair") {
    const report = await setupMcpIntegrations({ ide: parsed.ide ?? "auto", repair: true });
    console.log(JSON.stringify(report, null, 2));
    return report.healthy ? 0 : 1;
  }

  if (subcommand !== "templates") {
    console.error("`quiqsec integrations` supports templates, doctor, or repair.");
    return 2;
  }

  if (parsed.format === "sarif") {
    console.error("`quiqsec integrations` supports --format=pretty or --format=json.");
    return 2;
  }

  const report = buildIntegrationReport();
  const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderPrettyIntegrations(report);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return 0;
}

async function runSetup(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const report = await setupMcpIntegrations({
    ide: parsed.ide ?? "auto",
    repair: parsed.apply
  });

  console.log(JSON.stringify(report, null, 2));

  if (!report.healthy) {
    return 1;
  }

  const diagnostics = await diagnoseMcpIntegrations({ ide: parsed.ide ?? "auto" });
  console.log(JSON.stringify(diagnostics, null, 2));
  return diagnostics.healthy ? 0 : 1;
}

async function runDeploy(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const root = parsed.paths[0] ?? process.cwd();

  if (parsed.format === "sarif") {
    console.error("`quiqsec deploy` supports --format=pretty or --format=json.");
    return 2;
  }

  const report = await analyzeDeployShield(root, { applyFixes: parsed.apply });
  const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderPrettyDeploy(report);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return report.blocked ? 1 : 0;
}

async function runCloud(args: string[]): Promise<number> {
  const [action = "status"] = args;
  const parsed = parseArgs(args.slice(1));

  switch (action) {
    case "status": {
      const config = await loadConfig();
      const snapshot = {
        enabled: config.cloud.enabled,
        endpoint: config.cloud.endpoint || "not set",
        authMode: config.cloud.authMode,
        tokenConfigured: Boolean(config.cloud.token)
      };
      console.log(JSON.stringify(snapshot, null, 2));
      return 0;
    }
    case "enable": {
      await setCloudEnabled(true);
      console.log("Cloud sync enabled.");
      return 0;
    }
    case "disable": {
      await setCloudEnabled(false);
      console.log("Cloud sync disabled.");
      return 0;
    }
    case "endpoint": {
      if (!parsed.endpoint) {
        console.error("`quiqsec cloud endpoint` requires --endpoint URL.");
        return 2;
      }
      await setCloudEndpoint(parsed.endpoint);
      console.log(`Cloud endpoint set to ${parsed.endpoint}`);
      return 0;
    }
    case "login": {
      if (parsed.token) {
        await setCloudToken(parsed.token);
        await setCloudEnabled(true);
        console.log("Cloud token saved.");
        return 0;
      }

      if (parsed.deviceCode) {
        const result = await exchangeDeviceCode(parsed.deviceCode);
        console.log(result.message);
        return result.synced ? 0 : 1;
      }

      console.error("`quiqsec cloud login` requires --token VALUE or --device-code CODE.");
      return 2;
    }
    case "sync": {
      const result = await syncLatestReportToCloud();
      console.log(result.message);
      return result.synced ? 0 : (result.attempted ? 1 : 2);
    }
    default:
      console.error(`Unknown cloud action: ${action}`);
      return 2;
  }
}

async function runTeam(args: string[]): Promise<number> {
  const [action = "list"] = args;
  const parsed = parseArgs(args.slice(1));
  const workspace = await readWorkspace();

  switch (action) {
    case "list":
      console.log(JSON.stringify(workspace.members, null, 2));
      return 0;
    case "add": {
      if (!parsed.name || !parsed.role) {
        console.error("`quiqsec team add` requires --name and --role.");
        return 2;
      }

      workspace.members.push({
        id: `member-${Date.now()}`,
        name: parsed.name,
        role: parsed.role,
        email: parsed.email
      });
      await saveWorkspace(workspace);
      console.log(`Added team member ${parsed.name}.`);
      return 0;
    }
    case "remove": {
      if (!parsed.memberId) {
        console.error("`quiqsec team remove` requires --id MEMBER_ID.");
        return 2;
      }

      const nextMembers = workspace.members.filter((member) => member.id !== parsed.memberId);
      if (nextMembers.length === workspace.members.length) {
        console.error("Team member not found.");
        return 1;
      }

      workspace.members = nextMembers;
      await saveWorkspace(workspace);
      console.log(`Removed team member ${parsed.memberId}.`);
      return 0;
    }
    default:
      console.error(`Unknown team action: ${action}`);
      return 2;
  }
}

async function runGuard(args: string[]): Promise<number> {
  const parsed = parseArgs(args);

  if (parsed.format === "sarif") {
    console.error("`quiqsec guard` supports --format=pretty or --format=json.");
    return 2;
  }

  const prompt = await resolvePrompt(parsed);
  const result = buildGuardrailPrompt(prompt);
  const rendered = parsed.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderPrettyGuardrail(result);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return 0;
}

async function runVerify(args: string[]): Promise<number> {
  const parsed = parseArgs(args);

  if (parsed.format === "sarif") {
    console.error("`quiqsec verify` supports --format=pretty or --format=json.");
    return 2;
  }

  if (!parsed.prompt && !parsed.promptFile) {
    console.error("`quiqsec verify` requires --prompt \"...\" or --prompt-file path.");
    return 2;
  }

  const prompt = await resolvePrompt(parsed);
  const spinner = new Spinner("Verifying generated output", parsed.format === "pretty" && !parsed.output);
  spinner.start();

  let report;
  try {
    report = await verifyPromptOutput(prompt, parsed.paths);
    spinner.stop(report.passed ? "Verification complete: pass" : "Verification complete: review needed");
  } catch (error) {
    spinner.stop("Verification failed");
    throw error;
  }

  const rendered = parsed.format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderPrettyVerification(report);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return report.passed ? 0 : 1;
}

async function runScan(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const spinner = new Spinner("Scanning project", parsed.format === "pretty" && !parsed.output);
  spinner.start();

  let report;
  try {
    report = await scanPaths(parsed.paths, {
      external: {
        semgrep: parsed.semgrep || undefined,
        gitleaks: parsed.gitleaks || undefined,
        timeoutMs: parsed.timeoutMs
      },
      useExternalScanners: parsed.semgrep || parsed.gitleaks ? true : undefined
    });
    spinner.stop(report.blocked ? "Scan complete: deploy blocked" : "Scan complete: pass");
  } catch (error) {
    spinner.stop("Scan failed");
    throw error;
  }

  const rendered = renderScan(report, parsed.format);

  if (parsed.output) {
    await writeFile(parsed.output, rendered, "utf8");
  } else {
    process.stdout.write(rendered);
  }

  return shouldBlock(report.summary) ? 1 : 0;
}

async function runReport(args: string[]): Promise<number> {
  if (!args.includes("--health")) {
    console.error("Only `quiqsec report --health` is implemented in the MVP.");
    return 2;
  }

  const parsed = parseArgs(args);

  if (parsed.format === "sarif") {
    console.error("`quiqsec report --health` supports --format=pretty or --format=json.");
    return 2;
  }

  const report = await readLastReport();
  const healthReport = report?.healthReport ?? {
    healthScore: 100,
    issues: {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    },
    lastScan: "never"
  };

  if (parsed.format === "json") {
    console.log(JSON.stringify(healthReport, null, 2));
  } else {
    process.stdout.write(renderPrettyHealth(healthReport));
  }

  return 0;
}

async function runSnapshot(): Promise<number> {
  const snapshot = await createSnapshot();
  console.log(`Created snapshot ${snapshot.tag} at ${snapshot.commit}`);
  return 0;
}

async function runRollback(args: string[]): Promise<number> {
  const parsed = parseArgs(args);
  const preview = parsed.yes ? await restoreSnapshot() : await previewRollback();

  if (parsed.yes) {
    console.log(`Restored snapshot ${preview.tag} (${preview.commit})`);
  } else {
    console.log(`Rollback preview for ${preview.tag} (${preview.commit})`);
    console.log("Run `quiqsec rollback --yes` to restore this snapshot.");
  }

  if (preview.changedFiles.length === 0) {
    console.log("No file changes between the snapshot and current HEAD.");
  } else {
    console.log("Files that would change:");
    for (const file of preview.changedFiles) {
      console.log(`- ${file}`);
    }
  }

  console.log("Recovery plan:");
  console.log(preview.recoveryPlan);

  return 0;
}

function parseArgs(args: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    paths: [],
    format: "pretty",
    yes: false,
    dryRun: true,
    apply: false,
    semgrep: false,
    gitleaks: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--yes") {
      parsed.yes = true;
      parsed.dryRun = false;
      continue;
    }

    if (arg === "--dry-run") {
      parsed.dryRun = true;
      continue;
    }

    if (arg === "--apply") {
      parsed.apply = true;
      continue;
    }

    if (arg === "--repair") {
      parsed.apply = true;
      continue;
    }

    if (arg === "--semgrep") {
      parsed.semgrep = true;
      continue;
    }

    if (arg === "--gitleaks") {
      parsed.gitleaks = true;
      continue;
    }

    if (arg === "--timeout" && args[index + 1]) {
      parsed.timeoutMs = Number.parseInt(args[index + 1], 10);
      index += 1;
      continue;
    }

    if (arg.startsWith("--timeout=")) {
      parsed.timeoutMs = Number.parseInt(arg.slice("--timeout=".length), 10);
      continue;
    }

    if (arg === "--format" && args[index + 1]) {
      parsed.format = normalizeFormat(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--format=")) {
      parsed.format = normalizeFormat(arg.slice("--format=".length));
      continue;
    }

    if (arg === "--output" && args[index + 1]) {
      parsed.output = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--output=")) {
      parsed.output = arg.slice("--output=".length);
      continue;
    }

    if (arg === "--prompt" && args[index + 1]) {
      parsed.prompt = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--prompt=")) {
      parsed.prompt = arg.slice("--prompt=".length);
      continue;
    }

    if (arg === "--prompt-file" && args[index + 1]) {
      parsed.promptFile = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--prompt-file=")) {
      parsed.promptFile = arg.slice("--prompt-file=".length);
      continue;
    }

    if (arg === "--logs" && args[index + 1]) {
      parsed.logs = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--logs=")) {
      parsed.logs = arg.slice("--logs=".length);
      continue;
    }

    if (arg === "--token" && args[index + 1]) {
      parsed.token = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--token=")) {
      parsed.token = arg.slice("--token=".length);
      continue;
    }

    if (arg === "--endpoint" && args[index + 1]) {
      parsed.endpoint = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--endpoint=")) {
      parsed.endpoint = arg.slice("--endpoint=".length);
      continue;
    }

    if (arg === "--device-code" && args[index + 1]) {
      parsed.deviceCode = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--device-code=")) {
      parsed.deviceCode = arg.slice("--device-code=".length);
      continue;
    }

    if (arg === "--name" && args[index + 1]) {
      parsed.name = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--name=")) {
      parsed.name = arg.slice("--name=".length);
      continue;
    }

    if (arg === "--role" && args[index + 1]) {
      parsed.role = normalizeRole(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--role=")) {
      parsed.role = normalizeRole(arg.slice("--role=".length));
      continue;
    }

    if (arg === "--email" && args[index + 1]) {
      parsed.email = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--email=")) {
      parsed.email = arg.slice("--email=".length);
      continue;
    }

    if (arg === "--id" && args[index + 1]) {
      parsed.memberId = args[index + 1];
      index += 1;
      continue;
    }

    if (arg.startsWith("--id=")) {
      parsed.memberId = arg.slice("--id=".length);
      continue;
    }

    if (arg === "--port" && args[index + 1]) {
      parsed.port = normalizePort(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--port=")) {
      parsed.port = normalizePort(arg.slice("--port=".length));
      continue;
    }

    if (arg === "--ide" && args[index + 1]) {
      parsed.ide = normalizeIde(args[index + 1]);
      index += 1;
      continue;
    }

    if (arg.startsWith("--ide=")) {
      parsed.ide = normalizeIde(arg.slice("--ide=".length));
      continue;
    }

    if (!arg.startsWith("-")) {
      parsed.paths.push(arg);
    }
  }

  return parsed;
}

function normalizeFormat(value: string): OutputFormat {
  if (value === "pretty" || value === "json" || value === "sarif") {
    return value;
  }

  throw new Error(`Unsupported format: ${value}`);
}

function printHelp(): void {
  console.log(`QuiqSec

Usage:
  quiqsec init
  quiqsec setup [--ide=auto|cursor|claude_code|vscode|continue|windsurf] [--apply|--repair]
  quiqsec scan [paths...] [--semgrep] [--gitleaks] [--timeout=5000] [--format=pretty|json|sarif] [--output=file]
  quiqsec guard --prompt "Create a login endpoint" [--format=pretty|json]  # fallback/debug only
  quiqsec verify --prompt "Create a login endpoint" [paths...] [--format=pretty|json]
  quiqsec runtime --logs runtime.log [--format=pretty|json]
  quiqsec dashboard [--port=4174]
  quiqsec integrations templates [--format=pretty|json]
  quiqsec integrations doctor [--ide=auto|cursor|claude_code|vscode|continue|windsurf]
  quiqsec integrations repair [--ide=auto|cursor|claude_code|vscode|continue|windsurf]
  quiqsec deploy [path] [--apply] [--format=pretty|json]
  quiqsec cloud status|enable|disable|endpoint --endpoint URL|login --token TOKEN|login --device-code CODE|sync
  quiqsec team list|add --name NAME --role owner|admin|developer|viewer [--email EMAIL]|remove --id MEMBER_ID
  quiqsec report --health [--format=pretty|json]
  quiqsec snapshot
  quiqsec rollback [--dry-run|--yes]

Default output:
  Human-friendly pretty output with color when the terminal supports it.

Blocking policy:
  Fail when any critical issue exists, or when more than two high-severity issues exist.
`);
}

function normalizePort(value: string): number {
  const port = Number.parseInt(value, 10);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Unsupported port: ${value}`);
  }

  return port;
}

function normalizeRole(value: string): "owner" | "admin" | "developer" | "viewer" {
  if (value === "owner" || value === "admin" || value === "developer" || value === "viewer") {
    return value;
  }

  throw new Error(`Unsupported role: ${value}`);
}

function normalizeIde(value: string): "auto" | "cursor" | "claude_code" | "vscode" | "continue" | "windsurf" {
  if (value === "auto" || value === "cursor" || value === "claude_code" || value === "vscode" || value === "continue" || value === "windsurf") {
    return value;
  }

  throw new Error(`Unsupported IDE target: ${value}`);
}

function renderScan(report: Awaited<ReturnType<typeof scanPaths>>, format: OutputFormat): string {
  if (format === "sarif") {
    return renderSarif(report);
  }

  if (format === "json") {
    return renderJson(report);
  }

  return renderPrettyScan(report);
}

async function resolvePrompt(parsed: ParsedArgs): Promise<string> {
  if (parsed.promptFile) {
    return readPromptFile(parsed.promptFile);
  }

  const prompt = parsed.prompt ?? parsed.paths.join(" ");
  if (!prompt.trim()) {
    throw new Error("A prompt is required. Use --prompt \"...\" or --prompt-file path.");
  }

  if (!parsed.prompt) {
    parsed.paths = [];
  }

  return prompt;
}

async function readPromptFile(filePath: string): Promise<string> {
  const { readFile } = await import("node:fs/promises");
  const value = await readFile(filePath, "utf8");
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}

function isCliEntrypoint(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  try {
    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return process.argv[1].endsWith("cli/index.js");
  }
}

if (isCliEntrypoint()) {
  main().then((code) => {
    process.exitCode = code;
  });
}
