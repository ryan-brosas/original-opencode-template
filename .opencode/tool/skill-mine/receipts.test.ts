import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { prepareReceipt, finalizeReceipt } from "./receipts.js";
import type { SkillMineConfig } from "./config.js";
import type { ProvisionalInput } from "./types.js";

function runGit(args: string[], cwd: string): string {
  const r = Bun.spawnSync(["git", ...args], { cwd, stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) {
    throw new Error(`git ${args.join(" ")} (${r.exitCode}): ${r.stderr.toString().trim()}`);
  }
  return r.stdout.toString().trim();
}

function setupRepo(): { cwd: string; cleanup: () => void } {
  const base = mkdtempSync(join(tmpdir(), "sm-receipt-"));
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

function sampleInput(workUnitId = "wu-1"): ProvisionalInput {
  return {
    workUnitId,
    changedPaths: ["src/a.ts"],
    checks: [{ id: "verify-sh", exitCode: 0 }],
    summary: "added feature a",
    risks: "none",
  };
}

describe("prepareReceipt", () => {
  test("rejects when a check has a non-zero exit", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      await expect(
        prepareReceipt(
          { ...sampleInput(), checks: [{ id: "verify-sh", exitCode: 1 }] },
          cfg,
          repo.cwd,
        ),
      ).rejects.toThrow(/checks must pass/i);
    } finally {
      repo.cleanup();
    }
  });

  test("rejects empty changed paths", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      await expect(
        prepareReceipt({ ...sampleInput(), changedPaths: [] }, cfg, repo.cwd),
      ).rejects.toThrow(/changedPaths/i);
    } finally {
      repo.cleanup();
    }
  });

  test("writes a provisional receipt with the staged tree hash and branch", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      const prov = await prepareReceipt(sampleInput(), cfg, repo.cwd);
      expect(prov.status).toBe("provisional");
      expect(prov.stagedTreeHash).toMatch(/^[0-9a-f]{40}$/);
      expect(prov.branch).toBe("main");
      expect(prov.changedPaths).toEqual(["src/a.ts"]);
      expect(prov.judgeVersion).toBe("v1-writing-skills");
    } finally {
      repo.cleanup();
    }
  });
});

describe("finalizeReceipt", () => {
  test("fails when no provisional receipt exists", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      await expect(finalizeReceipt("nope", cfg, repo.cwd)).rejects.toThrow(/provisional/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when nothing was committed after prepare (no new commit)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "new.txt"), "x\n");
      runGit(["add", "new.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      await expect(finalizeReceipt("wu-1", cfg, repo.cwd)).rejects.toThrow(/no new commit/i);
    } finally {
      repo.cleanup();
    }
  });

  test("rejects a workUnitId that could traverse the receipts directory", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await expect(prepareReceipt({ ...sampleInput("../escape") }, cfg, repo.cwd)).rejects.toThrow(
        /workUnitId/i,
      );
    } finally {
      repo.cleanup();
    }
  });

  test("rejects a changedPath that escapes the repo root", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await expect(
        prepareReceipt({ ...sampleInput(), changedPaths: ["/etc/passwd"] }, cfg, repo.cwd),
      ).rejects.toThrow(/escapes the repo/i);
    } finally {
      repo.cleanup();
    }
  });

  test("strips extra fields from checks (privacy: no rawOutput rides along)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(
        {
          ...sampleInput(),
          checks: [
            { id: "verify-sh", exitCode: 0, rawOutput: "supersecret" } as unknown as {
              id: string;
              exitCode: number;
            },
          ],
        },
        cfg,
        repo.cwd,
      );
      const prov = JSON.parse(
        readFileSync(join(cfg.runtimeRoot, "receipts", "wu-1.provisional.json"), "utf8"),
      );
      expect(prov.checks).toEqual([{ id: "verify-sh", exitCode: 0 }]);
      expect("rawOutput" in prov.checks[0]).toBe(false);
    } finally {
      repo.cleanup();
    }
  });

  test("finalize conflicts when the commit is already finalized for a different workUnitId", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput("wu-1"), cfg, repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      runGit(["push", "origin", "main"], repo.cwd);
      await finalizeReceipt("wu-1", cfg, repo.cwd);
      // same commit, different workUnitId -> conflict, not silent success
      await expect(finalizeReceipt("wu-other", cfg, repo.cwd)).rejects.toThrow(/conflict/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails on tree mismatch (extra file committed after prepare)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      writeFileSync(join(repo.cwd, "b.txt"), "b\n");
      runGit(["add", "b.txt"], repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      await expect(finalizeReceipt("wu-1", cfg, repo.cwd)).rejects.toThrow(/tree mismatch/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails on wrong branch", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      runGit(["checkout", "-b", "other"], repo.cwd);
      await expect(finalizeReceipt("wu-1", cfg, repo.cwd)).rejects.toThrow(/branch mismatch/i);
    } finally {
      repo.cleanup();
    }
  });

  test("fails when the commit was not pushed (stale remote)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      await expect(finalizeReceipt("wu-1", cfg, repo.cwd)).rejects.toThrow(
        /stale remote|not pushed/i,
      );
    } finally {
      repo.cleanup();
    }
  });

  test("succeeds after commit + push and binds SHA, tree, branch, remote", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      runGit(["push", "origin", "main"], repo.cwd);
      const fin = await finalizeReceipt("wu-1", cfg, repo.cwd);
      expect(fin.status).toBe("finalized");
      expect(fin.commitSha).toMatch(/^[0-9a-f]{40}$/);
      expect(fin.commitTreeHash).toBe(fin.stagedTreeHash);
      expect(fin.remoteHeadSha).toBe(fin.commitSha);
      expect(fin.branch).toBe("main");
      const path = join(cfg.runtimeRoot, "receipts", `${fin.commitSha}.finalized.json`);
      expect(existsSync(path)).toBe(true);
    } finally {
      repo.cleanup();
    }
  });

  test("is idempotent (re-finalize returns the same receipt)", async () => {
    const repo = setupRepo();
    try {
      const cfg = tempConfig(join(repo.cwd, "..", "rt"));
      writeFileSync(join(repo.cwd, "a.txt"), "a\n");
      runGit(["add", "a.txt"], repo.cwd);
      await prepareReceipt(sampleInput(), cfg, repo.cwd);
      runGit(["commit", "-m", "ship"], repo.cwd);
      runGit(["push", "origin", "main"], repo.cwd);
      const fin1 = await finalizeReceipt("wu-1", cfg, repo.cwd);
      const fin2 = await finalizeReceipt("wu-1", cfg, repo.cwd);
      expect(fin2.commitSha).toBe(fin1.commitSha);
      expect(fin2.status).toBe("finalized");
    } finally {
      repo.cleanup();
    }
  });
});
