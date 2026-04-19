import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { appendSnapshot } from "./storage.js";
import type { RollbackPreview, Snapshot } from "./types.js";

const execFileAsync = promisify(execFile);
const SNAPSHOT_PREFIX = "qs-snap";

export async function createSnapshot(cwd = process.cwd()): Promise<Snapshot> {
  await assertGitRepo(cwd);
  const dirty = await hasUncommittedChanges(cwd);
  if (dirty) {
    throw new Error("Refusing to snapshot a dirty worktree. Commit or stash changes first.");
  }

  const commit = await git(["rev-parse", "HEAD"], cwd);
  const tag = `${SNAPSHOT_PREFIX}-${formatSnapshotTimestamp(new Date())}`;
  await git(["tag", tag, commit.stdout.trim()], cwd);

  const snapshot: Snapshot = {
    id: tag,
    tag,
    commit: commit.stdout.trim(),
    createdAt: new Date().toISOString()
  };

  await appendSnapshot(snapshot, cwd);
  return snapshot;
}

export async function previewRollback(cwd = process.cwd()): Promise<RollbackPreview> {
  await assertGitRepo(cwd);
  const tag = await getLatestSnapshotTag(cwd);
  const commit = await git(["rev-list", "-n", "1", tag], cwd);
  const diff = await git(["diff", "--name-status", `${tag}..HEAD`], cwd);

  const changedFiles = diff.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    tag,
    commit: commit.stdout.trim(),
    changedFiles,
    recoveryPlan: buildRecoveryPlan(tag, changedFiles)
  };
}

export async function restoreSnapshot(cwd = process.cwd()): Promise<RollbackPreview> {
  const preview = await previewRollback(cwd);
  const dirty = await hasUncommittedChanges(cwd);

  if (dirty) {
    throw new Error("Refusing rollback with uncommitted work. Commit or stash changes first.");
  }

  await git(["reset", "--hard", preview.tag], cwd);
  return preview;
}

function buildRecoveryPlan(tag: string, changedFiles: string[]): string {
  if (changedFiles.length === 0) {
    return [
      `Rollback target ${tag} matches current HEAD.`,
      "No source files need to change.",
      "Recommendation: run `quiqsec scan .` to confirm current health before deploying."
    ].join(" ");
  }

  const highlights = changedFiles.slice(0, 5).map((line) => line.replace(/^.\s+/, "")).join(", ");
  return [
    `Rollback will restore ${changedFiles.length} changed file(s) from ${tag}.`,
    `Top impacted paths: ${highlights}${changedFiles.length > 5 ? ", ..." : ""}.`,
    "Recommendation: run `quiqsec scan .` and `quiqsec verify --prompt ...` after restore to validate auth, input checks, and secret handling."
  ].join(" ");
}

export function formatSnapshotTimestamp(date: Date): string {
  const pad = (value: number) => value.toString().padStart(2, "0");
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "-",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds())
  ].join("");
}

async function assertGitRepo(cwd: string): Promise<void> {
  try {
    await git(["rev-parse", "--is-inside-work-tree"], cwd);
  } catch {
    throw new Error("This command requires a git repository.");
  }
}

async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const status = await git(["status", "--short"], cwd);
  return status.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .some((line) => {
      const filePath = line.slice(3).replace(/\\/g, "/");
      return filePath !== ".quiqsec" && !filePath.startsWith(".quiqsec/");
    });
}

async function getLatestSnapshotTag(cwd: string): Promise<string> {
  const result = await git(["tag", "--list", `${SNAPSHOT_PREFIX}-*`, "--sort=-creatordate"], cwd);
  const tag = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);

  if (!tag) {
    throw new Error("No QuiqSec snapshots found.");
  }

  return tag;
}

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync("git", args, { cwd });
  return {
    stdout: result.stdout,
    stderr: result.stderr
  };
}
