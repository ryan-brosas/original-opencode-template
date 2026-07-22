import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareReceipt, finalizeReceipt } from "./receipts.js";
import { capture } from "./capture.js";
import type { SkillMineConfig } from "./config.js";
import type { ProvisionalInput, FinalizedReceipt } from "./types.js";

function runGit(args: string[], cwd: string): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} (${r.exitCode}): ${r.stderr.toString().trim()}`);
  }
  return r.stdout.toString().trim();
}

function setupRepo(): { cwd: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "sm-cap-"));
  const cwd = join(base, "work");
  mkdirSync(cwd, { recursive: true });
  runGit(["init", "-b", "main"], cwd);
  runGit(["config", "user.email", "test@test.com"], cwd);
  runGit(["config", "user.name", "Test"], cwd);
  const remote = join(base, "remote.git");
  runGit(["init", "--bare", remote], base);
  runGit(["remote", "add", "origin", remote], cwd);
  writeFileSync(join(cwd, "README"), "init\n");
  runGit(["add", "README"], cwd);
  runGit(["commit", "-m", "init"], cwd);
  runGit(["push", "-u", "origin", "main"], cwd);
  return { cwd, cleanup: () => rmSync(base, { recursive: true, force: true }) };
}

function tempConfig(runtimeRoot: string): SkillMineConfig {
  return {
    schemaVersion: 1,
    judgeVersion: "v1-writing-skills",
    maxActiveMinedSkills: 10,
    maxDescriptionBytes: 240,
    maxAggregateDescriptionBytes: 2400,
    projectSkillsRoot: ".opencode/project-skills",
    templateSkillsRoot: ".opencode/skill",
    runtimeRoot,
  };
}

async function ship(
  repo: { cwd: string },
  cfg: SkillMineConfig,
  input: ProvisionalInput,
): Promise<{ sha: string }> {
  writeFileSync(join(repo.cwd, "a.txt"), "a\n");
  runGit(["add", "a.txt"], repo.cwd);
  await prepareReceipt(input, cfg, repo.cwd);
  runGit(["commit", "-m", "ship"], repo.cwd);
  runGit(["push", "origin", "main"], repo.cwd);
  const sha = runGit(["rev-parse", "HEAD"], repo.cwd);
  // finalize creates receipts/<sha>.finalized.json
  await finalizeReceipt(input.workUnitId, cfg, repo.cwd);
  return { sha };
}

describe("capture", () => {
  test("fails when no finalized receipt exists for the sha", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      await expect(capture("deadbeefdeadbeef", cfg, repo.cwd)).rejects.toThrow(
        /no finalized receipt|not found/i,
      );
    } finally {
      repo.cleanup();
    }
  });

  test("fails when only a provisional receipt exists (not finalized / not pushed)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(
        {
          workUnitId: "wu-1",
          changedPaths: ["a.txt"],
          checks: [{ id: "verify-sh", exitCode: 0 }],
          summary: "ok",
          risks: "none",
        },
        cfg,
        repo.cwd,
      );
      runGit(["commit", "-m", "ship"], repo.cwd);
      // do NOT push or finalize
      const sha = runGit(["rev-parse", "HEAD"], repo.cwd);
      await expect(capture(sha, cfg, repo.cwd)).rejects.toThrow(/no finalized receipt|not found/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails on tree mismatch (forged receipt)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      const initSha = runGit(["rev-parse", "HEAD"], repo.cwd);
      const dir = join(cfg.runtimeRoot, "receipts");
      mkdirSync(dir, { recursive: true });
      const forged: FinalizedReceipt = {
        status: "finalized",
        workUnitId: "forged",
        stagedTreeHash: "0".repeat(40),
        commitSha: initSha,
        commitTreeHash: "badbadbadbadbadbadbadbadbadbadbadbadbadb",
        branch: "main",
        remoteHeadSha: initSha,
        changedPaths: ["x"],
        checks: [{ id: "verify-sh", exitCode: 0 }],
        summary: "forged",
        risks: "none",
        judgeVersion: "v1-writing-skills",
        finalizedAt: "2026-07-22T00:00:00.000Z",
      };
      writeFileSync(join(dir, `${initSha}.finalized.json`), JSON.stringify(forged));
      await expect(capture(initSha, cfg, repo.cwd)).rejects.toThrow(/tree mismatch/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when the commit does not exist", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      const bogus = "f".repeat(40);
      const dir = join(cfg.runtimeRoot, "receipts");
      mkdirSync(dir, { recursive: true });
      const forged: FinalizedReceipt = {
        status: "finalized",
        workUnitId: "forged",
        stagedTreeHash: "0".repeat(40),
        commitSha: bogus,
        commitTreeHash: "0".repeat(40),
        branch: "main",
        remoteHeadSha: bogus,
        changedPaths: ["x"],
        checks: [{ id: "verify-sh", exitCode: 0 }],
        summary: "forged",
        risks: "none",
        judgeVersion: "v1-writing-skills",
        finalizedAt: "2026-07-22T00:00:00.000Z",
      };
      writeFileSync(join(dir, `${bogus}.finalized.json`), JSON.stringify(forged));
      await expect(capture(bogus, cfg, repo.cwd)).rejects.toThrow(/commit not found|not found/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when the receipt summary contains a secret", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      const { sha } = await ship(repo, cfg, {
        workUnitId: "wu-1",
        changedPaths: ["a.txt"],
        checks: [{ id: "verify-sh", exitCode: 0 }],
        summary: "fixed leak of AKIAIOSFODNN7EXAMPLE in config",
        risks: "none",
      });
      await expect(capture(sha, cfg, repo.cwd)).rejects.toThrow(/secret|AKIA/i);
    } finally {
      repo.cleanup();
    }
  });

  test("succeeds and writes a sanitized trace with only allowlisted fields", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      const { sha } = await ship(repo, cfg, {
        workUnitId: "wu-1",
        changedPaths: ["a.txt"],
        checks: [
          { id: "verify-sh", exitCode: 0 },
          { id: "tsc", exitCode: 0 },
        ],
        summary: "added feature a",
        risks: "none",
      });
      const trace = await capture(sha, cfg, repo.cwd);
      expect(trace.commitSha).toBe(sha);
      expect(trace.workUnitId).toBe("wu-1");
      expect(trace.checks).toHaveLength(2);
      expect(trace.checks[0]).toEqual({ id: "verify-sh", exitCode: 0 });
      const path = join(cfg.runtimeRoot, "traces", `${sha}.json`);
      expect(existsSync(path)).toBe(true);
      const onDisk = JSON.parse(readFileSync(path, "utf8"));
      expect(onDisk.commitSha).toBe(sha);
      expect(onDisk.summary).toBe("added feature a");
      // no raw prompt/diff fields leaked
      expect("prompt" in onDisk).toBe(false);
      expect("diff" in onDisk).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when the summary contains an AWS STS (ASIA) token", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      const { sha } = await ship(repo, cfg, {
        workUnitId: "wu-1",
        changedPaths: ["a.txt"],
        checks: [{ id: "verify-sh", exitCode: 0 }],
        summary: "rotated creds ASIAIOSFODNN7EXAMPLE into config",
        risks: "none",
      });
      await expect(capture(sha, cfg, repo.cwd)).rejects.toThrow(/secret|ASIA/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when the sha is a tree object, not a commit (forgery)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      // A real tree oid (from the index), not a commit.
      const treeOid = runGit(["write-tree"], repo.cwd);
      const dir = join(cfg.runtimeRoot, "receipts");
      mkdirSync(dir, { recursive: true });
      const forged: FinalizedReceipt = {
        status: "finalized",
        workUnitId: "forged",
        stagedTreeHash: treeOid,
        parentSha: "0".repeat(40),
        commitSha: treeOid,
        commitTreeHash: treeOid,
        branch: "main",
        remoteHeadSha: treeOid,
        changedPaths: ["x"],
        checks: [{ id: "verify-sh", exitCode: 0 }],
        summary: "forged",
        risks: "none",
        judgeVersion: "v1-writing-skills",
        finalizedAt: "2026-07-22T00:00:00.000Z",
      };
      writeFileSync(join(dir, `${treeOid}.finalized.json`), JSON.stringify(forged));
      await expect(capture(treeOid, cfg, repo.cwd)).rejects.toThrow(/not a commit|commit/i);
    } finally {
      repo.cleanup();
    }
  });
});
