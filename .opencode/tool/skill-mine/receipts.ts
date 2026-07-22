// Skill-Mine completion receipts.
//
// prepareReceipt: after verify passes and paths are staged, capture the staged
// tree hash + branch + evidence. Writes a provisional receipt to the ignored
// runtime tree. Only allowlisted, sanitized fields are stored.
//
// finalizeReceipt: after a successful commit + push, bind the provisional
// receipt to the actual commit SHA, commit tree, and remote HEAD. Fails on:
// no new commit (HEAD unchanged since prepare), tree mismatch, branch
// mismatch, or stale remote (push did not succeed). Idempotent only for the
// SAME workUnitId.

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, chmodSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import type { SkillMineConfig } from "./config.js";
import type {
  CheckResult,
  ProvisionalInput,
  ProvisionalReceipt,
  FinalizedReceipt,
} from "./types.js";

// Safe identifier: alnum + underscore/hyphen, 1-64 chars, no path separators
// or dots (blocks ".." traversal in receipt filenames).
const WORK_UNIT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const CHECK_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export async function prepareReceipt(
  input: ProvisionalInput,
  cfg: SkillMineConfig,
  cwd: string = process.cwd(),
): Promise<ProvisionalReceipt> {
  if (typeof input.workUnitId !== "string" || !WORK_UNIT_ID.test(input.workUnitId)) {
    throw new Error(
      "workUnitId must match [A-Za-z0-9][A-Za-z0-9_-]{0,63} (no path separators or dots)",
    );
  }
  if (!Array.isArray(input.changedPaths) || input.changedPaths.length === 0) {
    throw new Error("changedPaths must not be empty");
  }
  if (typeof input.summary !== "string" || input.summary.trim() === "") {
    throw new Error("summary must be a non-empty string");
  }
  if (typeof input.risks !== "string") {
    throw new Error("risks must be a string");
  }

  // Sanitize checks: keep only {id, exitCode}; validate shape; require all pass.
  const checks = sanitizeChecks(input.checks);

  const stagedTreeHash = await git(["write-tree"], cwd);
  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  const parentSha = await git(["rev-parse", "HEAD"], cwd);
  const changedPaths = input.changedPaths.map((p) => normalizePath(p, cwd));

  const receipt: ProvisionalReceipt = {
    status: "provisional",
    workUnitId: input.workUnitId,
    stagedTreeHash,
    parentSha,
    branch,
    changedPaths,
    checks,
    summary: input.summary,
    risks: input.risks,
    judgeVersion: cfg.judgeVersion,
    createdAt: new Date().toISOString(),
  };

  const dir = receiptsDir(cfg);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  const path = provisionalPath(cfg, input.workUnitId);
  writeFileSync(path, JSON.stringify(receipt, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return receipt;
}

export async function finalizeReceipt(
  workUnitId: string,
  cfg: SkillMineConfig,
  cwd: string = process.cwd(),
): Promise<FinalizedReceipt> {
  if (typeof workUnitId !== "string" || !WORK_UNIT_ID.test(workUnitId)) {
    throw new Error("workUnitId must match [A-Za-z0-9][A-Za-z0-9_-]{0,63}");
  }

  const commitSha = await git(["rev-parse", "HEAD"], cwd);

  // Idempotent: if already finalized for this commit, return it ONLY if it
  // belongs to the same work unit. A different work unit's receipt is a
  // conflict, not a silent success.
  const existingPath = finalizedPath(cfg, commitSha);
  if (existsSync(existingPath)) {
    const existing = JSON.parse(readFileSync(existingPath, "utf8")) as FinalizedReceipt;
    if (existing.workUnitId !== workUnitId) {
      throw new Error(
        `finalize conflict: commit ${commitSha} already finalized for workUnitId ${existing.workUnitId}, not ${workUnitId}`,
      );
    }
    return existing;
  }

  const provFile = provisionalPath(cfg, workUnitId);
  if (!existsSync(provFile)) {
    throw new Error(`provisional receipt not found for workUnitId: ${workUnitId}`);
  }
  const prov = JSON.parse(readFileSync(provFile, "utf8")) as ProvisionalReceipt;

  // A NEW commit must have been made between prepare and finalize.
  if (commitSha === prov.parentSha) {
    throw new Error("no new commit since prepare (HEAD unchanged); commit before finalizing");
  }

  const commitTreeHash = await git(["rev-parse", "HEAD^{tree}"], cwd);
  if (commitTreeHash !== prov.stagedTreeHash) {
    throw new Error(
      `tree mismatch: commit tree ${commitTreeHash} != staged tree ${prov.stagedTreeHash}`,
    );
  }

  const branch = await git(["rev-parse", "--abbrev-ref", "HEAD"], cwd);
  if (branch !== prov.branch) {
    throw new Error(`branch mismatch: ${branch} != ${prov.branch}`);
  }

  let remoteHeadSha: string;
  try {
    remoteHeadSha = await git(["rev-parse", `origin/${branch}`], cwd);
  } catch {
    throw new Error(`stale remote: origin/${branch} not found (not pushed)`);
  }
  if (remoteHeadSha !== commitSha) {
    throw new Error(
      `stale remote: origin/${branch} (${remoteHeadSha}) != HEAD (${commitSha}); not pushed`,
    );
  }

  const finalized: FinalizedReceipt = {
    status: "finalized",
    workUnitId: prov.workUnitId,
    stagedTreeHash: prov.stagedTreeHash,
    parentSha: prov.parentSha,
    commitSha,
    commitTreeHash,
    branch,
    remoteHeadSha,
    changedPaths: prov.changedPaths,
    checks: prov.checks,
    summary: prov.summary,
    risks: prov.risks,
    judgeVersion: prov.judgeVersion,
    finalizedAt: new Date().toISOString(),
  };

  const dir = receiptsDir(cfg);
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  writeFileSync(existingPath, JSON.stringify(finalized, null, 2) + "\n", { mode: 0o600 });
  chmodSync(existingPath, 0o600);
  unlinkSync(provFile);
  return finalized;
}

function sanitizeChecks(checks: unknown): CheckResult[] {
  if (!Array.isArray(checks) || checks.length === 0) {
    throw new Error("checks must be a non-empty array");
  }
  return checks.map((c) => {
    if (typeof c !== "object" || c === null) {
      throw new Error("each check must be an object");
    }
    const obj = c as Record<string, unknown>;
    const id = obj.id;
    const exitCode = obj.exitCode;
    if (typeof id !== "string" || !CHECK_ID.test(id)) {
      throw new Error(`check.id must match [a-z0-9][a-z0-9-]{0,63}: ${String(id)}`);
    }
    if (typeof exitCode !== "number" || !Number.isInteger(exitCode)) {
      throw new Error(`check.exitCode must be an integer: ${String(exitCode)}`);
    }
    if (exitCode !== 0) {
      throw new Error(
        `check '${id}' failed (exit ${exitCode}); all checks must pass before preparing a receipt`,
      );
    }
    // Keep ONLY {id, exitCode}; drop any extra fields (e.g. rawOutput) so they
    // cannot bypass the privacy scan by riding inside a check object.
    return { id, exitCode } as CheckResult;
  });
}

function receiptsDir(cfg: SkillMineConfig): string {
  return join(cfg.runtimeRoot, "receipts");
}

function provisionalPath(cfg: SkillMineConfig, workUnitId: string): string {
  return join(receiptsDir(cfg), `${workUnitId}.provisional.json`);
}

function finalizedPath(cfg: SkillMineConfig, commitSha: string): string {
  return join(receiptsDir(cfg), `${commitSha}.finalized.json`);
}

function normalizePath(p: string, cwd: string): string {
  let s = String(p).replace(/^\.\//, "");
  if (isAbsolute(s)) {
    const rel = relative(cwd, s);
    s = rel && !rel.startsWith("..") ? rel : s;
  }
  if (s.startsWith("..") || s.includes("/..") || isAbsolute(s)) {
    throw new Error(`changedPath escapes the repo root: ${p}`);
  }
  return s;
}

export async function git(args: string[], cwd: string): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} failed (${exitCode}): ${stderr.trim()}`);
  }
  return stdout.trim();
}
