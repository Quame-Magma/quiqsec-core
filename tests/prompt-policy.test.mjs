import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildGuardrailPrompt } from "../dist/prompt/buildGuardrail.js";
import { classifyPrompt } from "../dist/prompt/classifyPrompt.js";
import { verifyPromptOutput } from "../dist/prompt/verifyIntent.js";

test("prompt classifier detects task-specific security categories", () => {
  const classification = classifyPrompt("Create an Express login endpoint backed by Postgres");

  assert.equal(classification.categories.includes("auth"), true);
  assert.equal(classification.categories.includes("api"), true);
  assert.equal(classification.categories.includes("database"), true);
  assert.equal(classification.confidence, "high");
});

test("guardrail prompt injects task-specific security policies", () => {
  const result = buildGuardrailPrompt("Build a Stripe webhook handler");
  const firstLine = result.modifiedPrompt.split("\n")[0];

  assert.equal(result.classification.categories.includes("payments"), true);
  assert.equal(firstLine.split(/\s+/).length <= 10, true);
  assert.match(result.modifiedPrompt, /Verify webhook signatures/i);
  assert.match(result.modifiedPrompt, /idempotency/i);
  assert.match(result.modifiedPrompt, /User request:/);
});

test("intent verification passes when expected controls are present", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-verify-pass-"));
  const file = path.join(dir, "db.js");
  await writeFile(file, [
    "export async function loadUser(db, userId) {",
    "  return db.query('SELECT * FROM users WHERE id = $1 AND owner_id = $2', [userId, userId]);",
    "}"
  ].join("\n"));

  const report = await verifyPromptOutput("Create a Postgres query function for user data", [file], dir);

  assert.equal(report.passed, true);
  assert.equal(report.missingControls.length, 0);
  assert.equal(report.satisfiedControls.some((control) => control.controlId === "db-parameterized-query"), true);
  assert.equal(report.satisfiedControls.some((control) => control.controlId === "db-authorization-scope"), true);
});

test("intent verification reports missing task-specific controls", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-verify-missing-"));
  const file = path.join(dir, "webhook.js");
  await writeFile(file, [
    "export async function handler(req, res) {",
    "  const event = req.body;",
    "  res.json({ ok: true });",
    "}"
  ].join("\n"));

  const report = await verifyPromptOutput("Build a Stripe webhook handler", [file], dir);
  const missingIds = new Set(report.missingControls.map((control) => control.controlId));

  assert.equal(report.passed, false);
  assert.equal(missingIds.has("payment-webhook-signature"), true);
  assert.equal(missingIds.has("payment-idempotency"), true);
});
