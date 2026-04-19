import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "../dist/config.js";
import { createDashboardServer } from "../dist/dashboard/server.js";
import { scanPaths } from "../dist/scanner/index.js";
import { readCollaboration, readScanHistory, readTelemetry, readWorkspace } from "../dist/storage.js";

test("scan persistence appends history and telemetry events", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-v2-history-"));
  await initProject(dir);
  const file = path.join(dir, "safe.js");
  await writeFile(file, "export const ok = true;\n");

  await scanPaths([file], { cwd: dir, writeFindings: true });
  await scanPaths([file], { cwd: dir, writeFindings: true });

  const history = await readScanHistory(dir);
  const telemetry = await readTelemetry(dir);

  assert.equal(history.length, 2);
  assert.equal(telemetry.filter((event) => event.type === "scan.completed").length, 2);
  assert.equal(history[0].healthScore, 100);
});

test("workspace metadata is initialized for local dashboard use", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-v2-workspace-"));
  await initProject(dir);

  const workspace = await readWorkspace(dir);

  assert.equal(workspace.projectName, path.basename(dir));
  assert.equal(workspace.members[0].role, "owner");
  assert.equal(workspace.integrations.some((integration) => integration.id === "mcp"), true);
});

test("dashboard API returns workspace, latest scan, history, and telemetry", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-v2-dashboard-"));
  await initProject(dir);
  const file = path.join(dir, "safe.js");
  await writeFile(file, "export const ok = true;\n");
  await scanPaths([file], { cwd: dir, writeFindings: true });

  const server = createDashboardServer(dir);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const url = `http://127.0.0.1:${address.port}/api/dashboard`;

  try {
    const response = await fetch(url);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.lastReport.healthReport.healthScore, 100);
    assert.equal(payload.history.length, 1);
    assert.equal(payload.telemetry.length, 1);
    assert.equal(payload.collaboration.comments.length, 0);
    assert.equal(payload.workspace.members[0].role, "owner");
    assert.equal(typeof payload.mcpHealth.status, "string");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("dashboard collaboration endpoints persist comments, feedback, and fix prompts", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-v2-collab-"));
  await initProject(dir);
  const file = path.join(dir, "vulnerable.js");
  await writeFile(
    file,
    [
      "export async function run(db, req) {",
      "  return db." + "que" + "ry(\"SELECT * FROM users WHERE id=\" + req.body.id);",
      "}"
    ].join("\n")
  );

  const report = await scanPaths([file], { cwd: dir, writeFindings: true });
  const finding = report.findings[0];
  assert.ok(finding);

  const server = createDashboardServer(dir);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const commentResponse = await fetch(`${base}/api/findings/${finding.id}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Please replace this with a parameterized query.", author: "Reviewer" })
    });
    const commentPayload = await commentResponse.json();
    assert.equal(commentResponse.status, 200);
    assert.equal(commentPayload.comment.author, "Reviewer");
    assert.equal(commentPayload.collaboration.comments.length, 1);

    const feedbackResponse = await fetch(`${base}/api/findings/${finding.id}/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ vote: "up", note: "Good start, needs a bind parameter." })
    });
    const feedbackPayload = await feedbackResponse.json();
    assert.equal(feedbackResponse.status, 200);
    assert.equal(feedbackPayload.feedback.vote, "up");
    assert.equal(feedbackPayload.collaboration.feedback.length, 1);

    const promptResponse = await fetch(`${base}/api/findings/${finding.id}/fix-prompt`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const promptPayload = await promptResponse.json();
    assert.equal(promptResponse.status, 200);
    assert.match(promptPayload.prompt, /Fix this security finding/);

    const copyResponse = await fetch(`${base}/api/findings/${finding.id}/fix-prompt/copy`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}"
    });
    const copyPayload = await copyResponse.json();
    assert.equal(copyResponse.status, 200);
    assert.equal(copyPayload.prompt, promptPayload.prompt);

    const collaboration = await readCollaboration(dir);
    assert.equal(collaboration.comments.length, 1);
    assert.equal(collaboration.feedback.length, 1);
    assert.equal(collaboration.actions.length, 4);

    const dashboardResponse = await fetch(`${base}/api/dashboard`);
    const dashboardPayload = await dashboardResponse.json();
    assert.equal(dashboardPayload.collaboration.comments.length, 1);
    assert.equal(dashboardPayload.collaboration.feedback.length, 1);
    assert.equal(dashboardPayload.collaboration.actions.length, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
