import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initProject } from "../dist/config.js";
import { analyzeRuntimeLog } from "../dist/runtime/anomaly.js";
import { readRuntimeReport, readTelemetry } from "../dist/storage.js";

test("runtime analyzer detects and persists critical runtime anomalies", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "quiqsec-v2-runtime-"));
  await initProject(dir);
  const log = path.join(dir, "runtime.log");
  await writeFile(log, [
    "GET /.env 404",
    "GET /wp-admin 404",
    "GET /debug 200",
    "token=secret-value"
  ].join("\n"));

  const report = await analyzeRuntimeLog(log, dir);
  const persisted = await readRuntimeReport(dir);
  const telemetry = await readTelemetry(dir);

  assert.equal(report.blocked, true);
  assert.equal(report.anomalies.some((anomaly) => anomaly.title === "Suspicious probing paths"), true);
  assert.equal(report.anomalies.some((anomaly) => anomaly.evidence.includes("secret-value")), false);
  assert.equal(persisted?.anomalies.length, report.anomalies.length);
  assert.equal(telemetry.some((event) => event.type === "runtime.anomaly"), true);
});
