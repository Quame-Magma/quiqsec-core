import http from "node:http";
import { randomUUID } from "node:crypto";
import type { MCPMessage } from "../types.js";
import { diagnoseMcpIntegrations } from "../integrations/setup.js";
import { markMcpServerStarted } from "../storage.js";
import { createMcpResponse, handleAfterEdit, handleBeforeSubmit, handlePing, handleScanRequest, handleStop, handleVerifyRequest } from "./handlers.js";
import { createDashboardServer } from "../dashboard/server.js";

const PORT = Number.parseInt(process.env.PORT ?? "3000", 10);

export function createServer(): http.Server {
  return createDashboardServer(process.cwd());
}

export function createMcpOnlyServer(): http.Server {
  void markMcpServerStarted(process.cwd());
  return http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/mcp") {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    try {
      const message = await readJsonBody<MCPMessage>(req);
      const payload = await dispatch(message);
      sendJson(res, 200, createMcpResponse(payload, message.id ?? randomUUID()));
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

async function dispatch(message: MCPMessage): Promise<unknown> {
  switch (message.type) {
    case "beforeSubmitPrompt":
      return handleBeforeSubmit(message.payload);
    case "afterFileEdit":
      return handleAfterEdit(message.payload);
    case "stop":
      return handleStop();
    case "scanRequest":
      return handleScanRequest(message.payload);
    case "verifyIntent":
      return handleVerifyRequest(message.payload);
    case "ping":
      return handlePing();
    case "scanResult":
      return { status: "received" };
    default:
      return { error: `Unknown MCP message type: ${message.type}` };
  }
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.writeHead(statusCode, { "content-type": "application/json" });
  res.end(JSON.stringify(payload, null, 2));
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

if (process.argv[1]?.endsWith("server/index.js")) {
  diagnoseMcpIntegrations({ ide: "auto" }).then((report) => {
    if (!report.healthy) {
      console.error("MCP interception diagnostics failed. Run `quiqsec setup --ide=auto --apply` before starting the server.");
      for (const result of report.results.filter((item) => item.status === "error")) {
        console.error(`- ${result.id}: ${result.message}`);
      }
      process.exitCode = 2;
      return;
    }

    createServer().listen(PORT, () => {
      console.log(`QuiqSec MCP server listening on http://127.0.0.1:${PORT}/mcp`);
    });
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
