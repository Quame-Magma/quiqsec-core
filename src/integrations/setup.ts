import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { stripBom } from "../config.js";
import { buildMcpTemplates } from "./templates.js";
import type { IntegrationPlatform } from "../types.js";

export interface SetupIntegrationResult {
  id: IntegrationPlatform;
  filePath: string;
  status: "created" | "updated" | "unchanged" | "error";
  message: string;
}

export interface SetupIntegrationReport {
  mode: "setup" | "repair" | "doctor";
  healthy: boolean;
  results: SetupIntegrationResult[];
}

interface SetupOptions {
  cwd?: string;
  ide?: IntegrationPlatform | "auto";
  repair?: boolean;
}

const EXPECTED_ARGS = ["dist/server/index.js"];

export async function setupMcpIntegrations(options: SetupOptions = {}): Promise<SetupIntegrationReport> {
  const cwd = options.cwd ?? process.cwd();
  const repair = Boolean(options.repair);
  const targets = selectTargets(options.ide ?? "auto");
  const results: SetupIntegrationResult[] = [];

  for (const template of targets) {
    const absolutePath = path.join(cwd, template.filePath);

    try {
      const existedBeforeWrite = await exists(absolutePath);
      await mkdir(path.dirname(absolutePath), { recursive: true });
      const existing = await readConfigFile(absolutePath);
      const before = JSON.stringify(existing);
      const merged = mergeQuiqSecServer(existing);
      const after = JSON.stringify(merged);

      if (before === after && !repair) {
        results.push({
          id: template.id,
          filePath: template.filePath,
          status: "unchanged",
          message: "MCP config already contains a valid quiqsec server entry"
        });
        continue;
      }

      await writeFile(absolutePath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      results.push({
        id: template.id,
        filePath: template.filePath,
        status: existedBeforeWrite ? "updated" : "created",
        message: repair
          ? "Repaired and normalized quiqsec MCP configuration"
          : "Configured quiqsec MCP server"
      });
    } catch (error) {
      results.push({
        id: template.id,
        filePath: template.filePath,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    mode: repair ? "repair" : "setup",
    healthy: results.every((item) => item.status !== "error"),
    results
  };
}

export async function diagnoseMcpIntegrations(options: Omit<SetupOptions, "repair"> = {}): Promise<SetupIntegrationReport> {
  const cwd = options.cwd ?? process.cwd();
  const targets = selectTargets(options.ide ?? "auto");
  const results: SetupIntegrationResult[] = [];

  for (const template of targets) {
    const absolutePath = path.join(cwd, template.filePath);

    if (!await exists(absolutePath)) {
      results.push({
        id: template.id,
        filePath: template.filePath,
        status: "error",
        message: "Missing MCP config file"
      });
      continue;
    }

    try {
      const parsed = await readConfigFile(absolutePath);
      const status = evaluateQuiqSecServer(parsed);
      results.push({
        id: template.id,
        filePath: template.filePath,
        status: status.ok ? "unchanged" : "error",
        message: status.message
      });
    } catch (error) {
      results.push({
        id: template.id,
        filePath: template.filePath,
        status: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  }

  return {
    mode: "doctor",
    healthy: results.every((item) => item.status !== "error"),
    results
  };
}

function selectTargets(ide: IntegrationPlatform | "auto") {
  const templates = buildMcpTemplates();
  if (ide === "auto") {
    return templates;
  }

  return templates.filter((template) => template.id === ide);
}

function mergeQuiqSecServer(parsed: Record<string, unknown>): Record<string, unknown> {
  const next = { ...parsed };
  const existingServers = isRecord(next.mcpServers) ? { ...next.mcpServers } : {};
  existingServers.quiqsec = {
    command: "node",
    args: EXPECTED_ARGS
  };
  next.mcpServers = existingServers;
  return next;
}

function evaluateQuiqSecServer(parsed: Record<string, unknown>): { ok: boolean; message: string } {
  if (!isRecord(parsed.mcpServers)) {
    return {
      ok: false,
      message: "mcpServers object is missing"
    };
  }

  const server = parsed.mcpServers.quiqsec;
  if (!isRecord(server)) {
    return {
      ok: false,
      message: "mcpServers.quiqsec entry is missing"
    };
  }

  const command = typeof server.command === "string" ? server.command : "";
  const args = Array.isArray(server.args) ? server.args.filter((arg): arg is string => typeof arg === "string") : [];

  if (command !== "node") {
    return {
      ok: false,
      message: "mcpServers.quiqsec.command must be 'node'"
    };
  }

  if (args.length !== 1 || args[0] !== EXPECTED_ARGS[0]) {
    return {
      ok: false,
      message: "mcpServers.quiqsec.args must equal ['dist/server/index.js']"
    };
  }

  return {
    ok: true,
    message: "MCP interception wiring is healthy"
  };
}

async function readConfigFile(filePath: string): Promise<Record<string, unknown>> {
  try {
    const raw = stripBom(await readFile(filePath, "utf8"));
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
