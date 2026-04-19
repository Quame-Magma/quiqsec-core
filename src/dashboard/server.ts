import http from "node:http";
import { randomUUID } from "node:crypto";
import { scanPaths } from "../scanner/index.js";
import type { MCPMessage, ScanReport, ScanResult } from "../types.js";
import {
  appendFindingAction,
  appendFindingComment,
  appendFindingFeedback,
  markMcpServerStarted,
  readLastReport
} from "../storage.js";
import {
  createMcpResponse,
  handleAfterEdit,
  handleBeforeSubmit,
  handlePing,
  handleScanRequest,
  handleStop,
  handleVerifyRequest
} from "../server/handlers.js";
import { getDashboardData } from "./data.js";
import { dashboardHtml } from "./view.js";

export interface DashboardServerOptions {
  cwd?: string;
  port?: number;
  host?: string;
}

export interface DashboardServerHandle {
  server: http.Server;
  url: string;
}

export async function startDashboardServer(options: DashboardServerOptions = {}): Promise<DashboardServerHandle> {
  const cwd = options.cwd ?? process.cwd();
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 4174;
  const server = createDashboardServer(cwd);

  await new Promise<void>((resolve) => {
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const resolvedPort = typeof address === "object" && address ? address.port : port;

  return {
    server,
    url: `http://${host}:${resolvedPort}/dashboard`
  };
}

export function createDashboardServer(cwd = process.cwd()): http.Server {
  void markMcpServerStarted(cwd);
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");

      if (req.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
        send(res, 200, dashboardHtml, "text/html; charset=utf-8");
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/dashboard") {
        sendJson(res, 200, await getDashboardData(cwd));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/scan") {
        const report = await scanPaths(["."], { cwd, writeFindings: true });
        sendJson(res, 200, report);
        return;
      }

      const findingRoute = parseFindingRoute(url.pathname);
      if (findingRoute && req.method === "POST") {
        const report = await readLastReport(cwd);
        const finding = report?.findings.find((item) => item.id === findingRoute.findingId);

        if (!finding) {
          sendJson(res, 404, { error: "Finding not found" });
          return;
        }

        if (findingRoute.action === "comments") {
          const body = await readJsonBody<Record<string, unknown>>(req);
          const text = typeof body.text === "string" ? body.text.trim() : "";

          if (!text) {
            sendJson(res, 400, { error: "Comment text is required" });
            return;
          }

          const comment = {
            id: randomUUID(),
            findingId: finding.id,
            author: typeof body.author === "string" && body.author.trim() ? body.author.trim() : "Local Owner",
            text,
            createdAt: new Date().toISOString()
          };

          const collaboration = await appendFindingComment(comment, cwd);
          await appendFindingAction({
            id: randomUUID(),
            findingId: finding.id,
            type: "comment.added",
            createdAt: comment.createdAt,
            detail: "Added a finding comment",
            data: { text, author: comment.author }
          }, cwd);

          sendJson(res, 200, { comment, collaboration });
          return;
        }

        if (findingRoute.action === "feedback") {
          const body = await readJsonBody<Record<string, unknown>>(req);
          const vote: "up" | "down" | "" = body.vote === "up" || body.vote === "down" ? body.vote : "";

          if (!vote) {
            sendJson(res, 400, { error: "Feedback vote must be up or down" });
            return;
          }

          const feedback = {
            id: randomUUID(),
            findingId: finding.id,
            vote,
            note: typeof body.note === "string" ? body.note.trim() : "",
            createdAt: new Date().toISOString()
          };

          const collaboration = await appendFindingFeedback(feedback, cwd);
          await appendFindingAction({
            id: randomUUID(),
            findingId: finding.id,
            type: "feedback.added",
            createdAt: feedback.createdAt,
            detail: vote === "up" ? "Marked finding as helpful" : "Marked finding as needing work",
            data: { vote, note: feedback.note }
          }, cwd);

          sendJson(res, 200, { feedback, collaboration });
          return;
        }

        if (findingRoute.action === "fix-prompt") {
          const prompt = buildFixPrompt(finding, report!);
          const actionType: "fix_prompt.copied" | "fix_prompt.generated" = findingRoute.copy ? "fix_prompt.copied" : "fix_prompt.generated";
          const action = {
            id: randomUUID(),
            findingId: finding.id,
            type: actionType,
            createdAt: new Date().toISOString(),
            detail: findingRoute.copy ? "Copied a fix prompt" : "Generated a fix prompt",
            data: { prompt }
          };
          await appendFindingAction(action, cwd);
          sendJson(res, 200, { prompt, action });
          return;
        }
      }

      if (req.method === "POST" && url.pathname === "/mcp") {
        const message = await readJsonBody<MCPMessage>(req);
        const payload = await dispatchMcp(message);
        sendJson(res, 200, createMcpResponse(payload, message.id ?? randomUUID()));
        return;
      }

      sendJson(res, 404, { error: "Not found" });
    } catch (error) {
      sendJson(res, 500, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });
}

async function dispatchMcp(message: MCPMessage): Promise<unknown> {
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
  send(res, statusCode, JSON.stringify(payload, null, 2), "application/json; charset=utf-8");
}

function send(res: http.ServerResponse, statusCode: number, body: string, contentType: string): void {
  res.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

async function readJsonBody<T>(req: http.IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T;
}

function parseFindingRoute(pathname: string): { findingId: string; action: "comments" | "feedback" | "fix-prompt"; copy: boolean } | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "findings" || parts.length < 4) {
    return null;
  }

  const findingId = parts[2];
  if (!findingId) {
    return null;
  }

  if (parts[3] === "comments" && parts.length === 4) {
    return { findingId, action: "comments", copy: false };
  }

  if (parts[3] === "feedback" && parts.length === 4) {
    return { findingId, action: "feedback", copy: false };
  }

  if (parts[3] === "fix-prompt" && parts.length === 4) {
    return { findingId, action: "fix-prompt", copy: false };
  }

  if (parts[3] === "fix-prompt" && parts[4] === "copy" && parts.length === 5) {
    return { findingId, action: "fix-prompt", copy: true };
  }

  return null;
}

function buildFixPrompt(finding: ScanResult, report: ScanReport): string {
  const lines = [
    "Fix this security finding with the smallest correct change.",
    `Rule: ${finding.ruleId}`,
    `Severity: ${finding.severity}`,
    `File: ${finding.file}:${finding.line}:${finding.column}`,
    `Issue: ${finding.message}`
  ];

  if (finding.evidence) {
    lines.push(`Evidence: ${finding.evidence}`);
  }

  lines.push(`Project health: ${report.healthReport.healthScore}/100`);
  lines.push(`Return a concise patch and keep the solution local-first.`);

  return lines.join("\n");
}
