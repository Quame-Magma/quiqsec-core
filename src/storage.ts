import { randomUUID } from "node:crypto";
import {
  ensureQuiqSecDir,
  COLLABORATION_FILE,
  FINDINGS_FILE,
  HISTORY_FILE,
  MCP_HEALTH_FILE,
  quiqsecPath,
  readJsonFile,
  RUNTIME_FILE,
  SNAPSHOTS_FILE,
  TELEMETRY_FILE,
  WORKSPACE_FILE,
  writeJsonFile
} from "./config.js";
import type {
  CollaborationState,
  RuntimeAnalysisReport,
  MCPHealthStatus,
  FindingActionEvent,
  FindingComment,
  FindingFeedback,
  ScanHistoryEntry,
  ScanReport,
  Snapshot,
  TelemetryEvent,
  WorkspaceState
} from "./types.js";

export async function saveFindings(report: ScanReport, cwd = process.cwd()): Promise<void> {
  await ensureQuiqSecDir(cwd);
  await writeJsonFile(quiqsecPath(cwd, FINDINGS_FILE), report);
  await appendScanHistory(report, cwd);
  await appendTelemetry({
    id: createEventId("scan"),
    type: "scan.completed",
    createdAt: report.generatedAt,
    data: {
      healthScore: report.healthReport.healthScore,
      blocked: report.blocked,
      filesScanned: report.filesScanned,
      summary: report.summary
    }
  }, cwd);
}

export async function readLastReport(cwd = process.cwd()): Promise<ScanReport | null> {
  return readJsonFile<ScanReport | null>(quiqsecPath(cwd, FINDINGS_FILE), null);
}

export async function appendSnapshot(snapshot: Snapshot, cwd = process.cwd()): Promise<Snapshot[]> {
  await ensureQuiqSecDir(cwd);
  const snapshots = await readSnapshots(cwd);
  snapshots.push(snapshot);
  await writeJsonFile(quiqsecPath(cwd, SNAPSHOTS_FILE), snapshots);
  return snapshots;
}

export async function readSnapshots(cwd = process.cwd()): Promise<Snapshot[]> {
  return readJsonFile<Snapshot[]>(quiqsecPath(cwd, SNAPSHOTS_FILE), []);
}

export async function appendScanHistory(report: ScanReport, cwd = process.cwd()): Promise<ScanHistoryEntry[]> {
  await ensureQuiqSecDir(cwd);
  const history = await readScanHistory(cwd);
  const entry: ScanHistoryEntry = {
    id: createEventId("scan-history"),
    generatedAt: report.generatedAt,
    filesScanned: report.filesScanned,
    healthScore: report.healthReport.healthScore,
    blocked: report.blocked,
    summary: report.summary
  };
  const nextHistory = [...history, entry].slice(-50);
  await writeJsonFile(quiqsecPath(cwd, HISTORY_FILE), nextHistory);
  return nextHistory;
}

export async function readScanHistory(cwd = process.cwd()): Promise<ScanHistoryEntry[]> {
  return readJsonFile<ScanHistoryEntry[]>(quiqsecPath(cwd, HISTORY_FILE), []);
}

export async function appendTelemetry(event: TelemetryEvent, cwd = process.cwd()): Promise<TelemetryEvent[]> {
  await ensureQuiqSecDir(cwd);
  const events = await readTelemetry(cwd);
  const nextEvents = [...events, event].slice(-100);
  await writeJsonFile(quiqsecPath(cwd, TELEMETRY_FILE), nextEvents);
  return nextEvents;
}

export async function readTelemetry(cwd = process.cwd()): Promise<TelemetryEvent[]> {
  return readJsonFile<TelemetryEvent[]>(quiqsecPath(cwd, TELEMETRY_FILE), []);
}

export async function readCollaboration(cwd = process.cwd()): Promise<CollaborationState> {
  return readJsonFile<CollaborationState>(quiqsecPath(cwd, COLLABORATION_FILE), {
    comments: [],
    feedback: [],
    actions: []
  });
}

export async function appendFindingComment(comment: FindingComment, cwd = process.cwd()): Promise<CollaborationState> {
  await ensureQuiqSecDir(cwd);
  const collaboration = await readCollaboration(cwd);
  const next = {
    ...collaboration,
    comments: [...collaboration.comments, comment]
  };
  await writeJsonFile(quiqsecPath(cwd, COLLABORATION_FILE), next);
  return next;
}

export async function appendFindingFeedback(feedback: FindingFeedback, cwd = process.cwd()): Promise<CollaborationState> {
  await ensureQuiqSecDir(cwd);
  const collaboration = await readCollaboration(cwd);
  const next = {
    ...collaboration,
    feedback: [...collaboration.feedback, feedback]
  };
  await writeJsonFile(quiqsecPath(cwd, COLLABORATION_FILE), next);
  return next;
}

export async function appendFindingAction(action: FindingActionEvent, cwd = process.cwd()): Promise<CollaborationState> {
  await ensureQuiqSecDir(cwd);
  const collaboration = await readCollaboration(cwd);
  const next = {
    ...collaboration,
    actions: [...collaboration.actions, action]
  };
  await writeJsonFile(quiqsecPath(cwd, COLLABORATION_FILE), next);
  return next;
}

export async function readWorkspace(cwd = process.cwd()): Promise<WorkspaceState> {
  return readJsonFile<WorkspaceState>(quiqsecPath(cwd, WORKSPACE_FILE), {
    projectName: cwd.split(/[\\/]/).at(-1) ?? "QuiqSec Project",
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
        id: "mcp",
        name: "MCP",
        status: "connected",
        detail: "Local MCP endpoint is available when the QuiqSec server runs."
      }
    ]
  });
}

export async function saveWorkspace(workspace: WorkspaceState, cwd = process.cwd()): Promise<void> {
  await ensureQuiqSecDir(cwd);
  await writeJsonFile(quiqsecPath(cwd, WORKSPACE_FILE), {
    ...workspace,
    updatedAt: new Date().toISOString()
  });
}

export async function readRuntimeReport(cwd = process.cwd()): Promise<RuntimeAnalysisReport | null> {
  return readJsonFile<RuntimeAnalysisReport | null>(quiqsecPath(cwd, RUNTIME_FILE), null);
}

export async function saveRuntimeReport(report: RuntimeAnalysisReport, cwd = process.cwd()): Promise<void> {
  await ensureQuiqSecDir(cwd);
  await writeJsonFile(quiqsecPath(cwd, RUNTIME_FILE), report);
  await appendTelemetry({
    id: createEventId("runtime"),
    type: "runtime.anomaly",
    createdAt: report.generatedAt,
    data: {
      source: report.source,
      anomalies: report.anomalies.length,
      blocked: report.blocked
    }
  }, cwd);
}

export async function readMcpHealth(cwd = process.cwd()): Promise<MCPHealthStatus> {
  return readJsonFile<MCPHealthStatus>(quiqsecPath(cwd, MCP_HEALTH_FILE), {
    status: "disconnected",
    serverStartedAt: new Date().toISOString(),
    lastPingAt: null,
    lastInterceptAt: null,
    lastAfterEditAt: null,
    diagnostics: ["Awaiting IDE MCP connection"]
  });
}

export async function saveMcpHealth(health: MCPHealthStatus, cwd = process.cwd()): Promise<void> {
  await ensureQuiqSecDir(cwd);
  await writeJsonFile(quiqsecPath(cwd, MCP_HEALTH_FILE), health);
}

export async function markMcpServerStarted(cwd = process.cwd()): Promise<MCPHealthStatus> {
  const current = await readMcpHealth(cwd);
  const next: MCPHealthStatus = {
    ...current,
    status: current.lastPingAt || current.lastInterceptAt || current.lastAfterEditAt ? "connected" : "degraded",
    serverStartedAt: new Date().toISOString(),
    diagnostics: current.lastPingAt || current.lastInterceptAt
      ? []
      : ["Server started but no MCP ping/intercept has been received yet"]
  };
  await saveMcpHealth(next, cwd);
  return next;
}

export async function markMcpPing(cwd = process.cwd()): Promise<MCPHealthStatus> {
  const current = await readMcpHealth(cwd);
  const next: MCPHealthStatus = {
    ...current,
    status: "connected",
    lastPingAt: new Date().toISOString(),
    diagnostics: []
  };
  await saveMcpHealth(next, cwd);
  return next;
}

export async function markMcpIntercept(cwd = process.cwd()): Promise<MCPHealthStatus> {
  const current = await readMcpHealth(cwd);
  const next: MCPHealthStatus = {
    ...current,
    status: "connected",
    lastInterceptAt: new Date().toISOString(),
    diagnostics: []
  };
  await saveMcpHealth(next, cwd);
  return next;
}

export async function markMcpAfterEdit(cwd = process.cwd()): Promise<MCPHealthStatus> {
  const current = await readMcpHealth(cwd);
  const next: MCPHealthStatus = {
    ...current,
    status: "connected",
    lastAfterEditAt: new Date().toISOString(),
    diagnostics: []
  };
  await saveMcpHealth(next, cwd);
  return next;
}

function createEventId(prefix: string): string {
  return `${prefix}-${Date.now()}-${randomUUID()}`;
}
