import { randomUUID } from "node:crypto";
import { createHealthReport } from "../policy.js";
import { buildGuardrailPrompt } from "../prompt/buildGuardrail.js";
import { verifyPromptOutput } from "../prompt/verifyIntent.js";
import { scanPaths } from "../scanner/index.js";
import { markMcpAfterEdit, markMcpIntercept, markMcpPing, readLastReport } from "../storage.js";

export async function handleBeforeSubmit(payload: unknown): Promise<unknown> {
  const prompt = isRecord(payload) && typeof payload.prompt === "string" ? payload.prompt : "";
  await markMcpIntercept(process.cwd());
  return buildGuardrailPrompt(prompt);
}

export async function handleAfterEdit(payload: unknown): Promise<unknown> {
  const files = isRecord(payload) && Array.isArray(payload.files)
    ? payload.files.filter((file): file is string => typeof file === "string")
    : [];
  await markMcpAfterEdit(process.cwd());
  const report = await scanPaths(files.length > 0 ? files : ["."], { writeFindings: true });
  const prompt = isRecord(payload) && typeof payload.prompt === "string" ? payload.prompt : "";
  const verification = prompt ? await verifyPromptOutput(prompt, files.length > 0 ? files : ["."], process.cwd()) : undefined;
  return { results: report.findings, healthReport: report.healthReport, blocked: report.blocked, verification };
}

export async function handlePing(): Promise<unknown> {
  const health = await markMcpPing(process.cwd());
  return {
    ok: true,
    health
  };
}

export async function handleStop(): Promise<unknown> {
  const report = await readLastReport();
  return {
    healthReport: report?.healthReport ?? createHealthReport([], new Date().toISOString())
  };
}

export async function handleScanRequest(payload: unknown): Promise<unknown> {
  const paths = isRecord(payload) && Array.isArray(payload.paths)
    ? payload.paths.filter((file): file is string => typeof file === "string")
    : ["."];
  return scanPaths(paths, { writeFindings: true });
}

export async function handleVerifyRequest(payload: unknown): Promise<unknown> {
  const paths = isRecord(payload) && Array.isArray(payload.paths)
    ? payload.paths.filter((file): file is string => typeof file === "string")
    : ["."];
  const prompt = isRecord(payload) && typeof payload.prompt === "string" ? payload.prompt : "";

  if (!prompt.trim()) {
    return { error: "prompt is required" };
  }

  return verifyPromptOutput(prompt, paths, process.cwd());
}

export function createMcpResponse(payload: unknown, id: string = randomUUID().toString()): { id: string; payload: unknown } {
  return { id, payload };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
