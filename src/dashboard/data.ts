import type { DashboardData } from "../types.js";
import { readCollaboration, readLastReport, readMcpHealth, readRuntimeReport, readScanHistory, readTelemetry, readWorkspace } from "../storage.js";

export async function getDashboardData(cwd = process.cwd()): Promise<DashboardData> {
  const [workspace, lastReport, history, runtime, telemetry, collaboration, mcpHealth] = await Promise.all([
    readWorkspace(cwd),
    readLastReport(cwd),
    readScanHistory(cwd),
    readRuntimeReport(cwd),
    readTelemetry(cwd),
    readCollaboration(cwd),
    readMcpHealth(cwd)
  ]);

  return {
    workspace,
    lastReport,
    history,
    runtime,
    telemetry,
    collaboration,
    mcpHealth
  };
}
