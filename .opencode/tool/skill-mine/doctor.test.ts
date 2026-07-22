import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import { doctorCheck } from "./doctor.js";

let roots: string[] = [];

function tempCfg(): SkillMineConfig {
  const root = mkdtempSync(join(tmpdir(), "sm-doctor-"));
  roots.push(root);
  const cfgPath = join(root, "skill-mine.json");
  writeFileSync(
    cfgPath,
    JSON.stringify(
      {
        ...DEFAULT_CONFIG,
        runtimeRoot: join(root, ".skill-mine"),
        projectSkillsRoot: join(root, "project-skills"),
        templateSkillsRoot: join(root, "skill"),
      },
      null,
      2,
    ),
  );
  const cfg = loadConfig(cfgPath);
  bootstrapRuntime(cfg);
  mkdirSync(cfg.projectSkillsRoot, { recursive: true });
  mkdirSync(cfg.templateSkillsRoot, { recursive: true });
  return cfg;
}

afterEach(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
  roots = [];
});

describe("doctorCheck", () => {
  test("all green on a fresh bootstrapped installation", () => {
    const cfg = tempCfg();
    const report = doctorCheck(cfg);
    expect(report.config.ok).toBe(true);
    expect(report.runtimeDirs.ok).toBe(true);
    expect(report.runtimeDirs.missing).toEqual([]);
    expect(report.locks.ok).toBe(true);
    expect(report.locks.stale).toEqual([]);
    expect(report.budget.ok).toBe(true);
    expect(report.budget.count).toBe(0);
    expect(report.telemetry.active).toBe(false);
    expect(report.overall.ok).toBe(true);
    expect(report.overall.failures).toEqual([]);
  });

  test("reports missing runtime dirs", () => {
    const cfg = tempCfg();
    rmSync(join(cfg.runtimeRoot, "candidates"), { recursive: true, force: true });
    const report = doctorCheck(cfg);
    expect(report.runtimeDirs.ok).toBe(false);
    expect(report.runtimeDirs.missing).toContain("candidates");
    expect(report.overall.ok).toBe(false);
    expect(report.overall.failures.length).toBeGreaterThan(0);
  });

  test("reports stale locks", () => {
    const cfg = tempCfg();
    writeFileSync(
      join(cfg.runtimeRoot, "journal", "my-skill.json"),
      JSON.stringify({
        operation: "retire",
        skillName: "my-skill",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    const report = doctorCheck(cfg);
    expect(report.locks.ok).toBe(false);
    expect(report.locks.stale).toContain("my-skill");
    expect(report.overall.ok).toBe(false);
  });

  test("ignores completed journal entries", () => {
    const cfg = tempCfg();
    writeFileSync(
      join(cfg.runtimeRoot, "journal", "old-skill.json"),
      JSON.stringify({
        operation: "retire",
        skillName: "old-skill",
        scope: "project",
        status: "completed",
        startedAt: new Date().toISOString(),
      }),
    );
    const report = doctorCheck(cfg);
    expect(report.locks.ok).toBe(true);
    expect(report.locks.stale).toEqual([]);
  });

  test("ignores malformed journal entries", () => {
    const cfg = tempCfg();
    writeFileSync(join(cfg.runtimeRoot, "journal", "bad.json"), "not json");
    const report = doctorCheck(cfg);
    expect(report.locks.ok).toBe(true);
    expect(report.locks.stale).toEqual([]);
  });

  test("reports budget overflow", () => {
    const cfg = tempCfg();
    for (let i = 0; i <= cfg.maxActiveMinedSkills; i++) {
      const name = `skill-${i}`;
      const dir = join(cfg.projectSkillsRoot, name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        join(dir, "SKILL.md"),
        `---
name: ${name}
description: test skill number ${i}
metadata:
  origin: skill-mine
  source_commit: abc123
  mined_date: "2026-01-01"
  judge_version: v1-writing-skills
  scope: project
  evidence_summary: test evidence
  content_hash: def456
---
# ${name}
Body.
`,
      );
    }
    const report = doctorCheck(cfg);
    expect(report.budget.ok).toBe(false);
    expect(report.budget.count).toBe(cfg.maxActiveMinedSkills + 1);
    expect(report.overall.ok).toBe(false);
  });

  test("telemetry active when usage.jsonl exists", () => {
    const cfg = tempCfg();
    writeFileSync(join(cfg.runtimeRoot, "usage.jsonl"), "");
    const report = doctorCheck(cfg);
    expect(report.telemetry.active).toBe(true);
  });

  test("telemetry inactive when usage.jsonl absent", () => {
    const cfg = tempCfg();
    const report = doctorCheck(cfg);
    expect(report.telemetry.active).toBe(false);
  });
});
