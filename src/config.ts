import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { QuiqSecConfig } from "./types.js";

export const QUIQSEC_DIR = ".quiqsec";
export const CONFIG_FILE = "config.json";
export const FINDINGS_FILE = "findings.json";
export const SNAPSHOTS_FILE = "snapshots.json";
export const HISTORY_FILE = "history.json";
export const TELEMETRY_FILE = "telemetry.json";
export const COLLABORATION_FILE = "collaboration.json";
export const WORKSPACE_FILE = "workspace.json";
export const RUNTIME_FILE = "runtime.json";
export const MCP_HEALTH_FILE = "mcp-health.json";

export const defaultConfig: QuiqSecConfig = {
  version: 1,
  severityPolicy: {
    blockOnCritical: true,
    maxHighBeforeBlock: 2
  },
  scan: {
    include: ["."],
    exclude: ["node_modules", ".git", "dist", ".quiqsec", ".mvp-test", "rules/base-rules.json"],
    external: {
      semgrep: false,
      gitleaks: false,
      timeoutMs: 5000
    }
  },
  rules: {
    paths: []
  },
  cloud: {
    enabled: false,
    endpoint: "",
    projectId: "",
    authMode: "token",
    token: ""
  }
};

export function quiqsecPath(cwd: string, fileName?: string): string {
  const base = path.join(cwd, QUIQSEC_DIR);
  return fileName ? path.join(base, fileName) : base;
}

export async function ensureQuiqSecDir(cwd = process.cwd()): Promise<string> {
  const dir = quiqsecPath(cwd);
  await mkdir(dir, { recursive: true });
  return dir;
}

export async function initProject(cwd = process.cwd()): Promise<QuiqSecConfig> {
  await ensureQuiqSecDir(cwd);
  const configPath = quiqsecPath(cwd, CONFIG_FILE);
  await writeJsonFile(configPath, defaultConfig);

  const findingsPath = quiqsecPath(cwd, FINDINGS_FILE);
  const snapshotsPath = quiqsecPath(cwd, SNAPSHOTS_FILE);
  await writeJsonFile(findingsPath, null);
  await writeJsonFile(snapshotsPath, []);
  await writeJsonFile(quiqsecPath(cwd, HISTORY_FILE), []);
  await writeJsonFile(quiqsecPath(cwd, TELEMETRY_FILE), []);
  await writeJsonFile(quiqsecPath(cwd, COLLABORATION_FILE), {
    comments: [],
    feedback: [],
    actions: []
  });
  await writeJsonFile(quiqsecPath(cwd, RUNTIME_FILE), null);
  await writeJsonFile(quiqsecPath(cwd, MCP_HEALTH_FILE), {
    status: "disconnected",
    serverStartedAt: new Date().toISOString(),
    lastPingAt: null,
    lastInterceptAt: null,
    lastAfterEditAt: null,
    diagnostics: ["Awaiting IDE MCP connection"]
  });
  await writeJsonFile(quiqsecPath(cwd, WORKSPACE_FILE), {
    projectName: path.basename(cwd),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    members: [
      {
        id: "local-owner",
        name: "Local Owner",
        role: "owner"
      }
    ],
    integrations: [
      {
        id: "github",
        name: "GitHub",
        status: "not_configured",
        detail: "Connect a repository to publish SARIF code scanning results."
      },
      {
        id: "mcp",
        name: "MCP",
        status: "connected",
        detail: "Local MCP endpoint is available when the QuiqSec server runs."
      }
    ]
  });

  return defaultConfig;
}

export async function loadConfig(cwd = process.cwd()): Promise<QuiqSecConfig> {
  try {
    const raw = stripBom(await readFile(quiqsecPath(cwd, CONFIG_FILE), "utf8"));
    const parsed = JSON.parse(raw) as Partial<QuiqSecConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      severityPolicy: {
        ...defaultConfig.severityPolicy,
        ...parsed.severityPolicy
      },
      scan: {
        ...defaultConfig.scan,
        ...parsed.scan,
        include: mergeStringLists(defaultConfig.scan.include, parsed.scan?.include),
        exclude: mergeStringLists(defaultConfig.scan.exclude, parsed.scan?.exclude),
        external: {
          ...defaultConfig.scan.external,
          ...parsed.scan?.external
        }
      },
      rules: {
        ...defaultConfig.rules,
        ...parsed.rules,
        paths: mergeStringLists(defaultConfig.rules.paths, parsed.rules?.paths)
      },
      cloud: {
        ...defaultConfig.cloud,
        ...parsed.cloud
      }
    };
  } catch {
    return defaultConfig;
  }
}

export async function saveConfig(config: QuiqSecConfig, cwd = process.cwd()): Promise<void> {
  await ensureQuiqSecDir(cwd);
  await writeJsonFile(quiqsecPath(cwd, CONFIG_FILE), config);
}

function mergeStringLists(defaultValues: string[], configuredValues?: string[]): string[] {
  return Array.from(new Set([...defaultValues, ...(configuredValues ?? [])]));
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = stripBom(await readFile(filePath, "utf8"));
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function stripBom(value: string): string {
  return value.charCodeAt(0) === 0xfeff ? value.slice(1) : value;
}
