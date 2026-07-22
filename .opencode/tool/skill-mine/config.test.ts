import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";

describe("DEFAULT_CONFIG", () => {
  test("has correct tracked defaults", () => {
    expect(DEFAULT_CONFIG.schemaVersion).toBe(1);
    expect(DEFAULT_CONFIG.judgeVersion).toBe("v1-writing-skills");
    expect(DEFAULT_CONFIG.maxActiveMinedSkills).toBe(10);
    expect(DEFAULT_CONFIG.maxDescriptionBytes).toBe(240);
    expect(DEFAULT_CONFIG.maxAggregateDescriptionBytes).toBe(2400);
    expect(DEFAULT_CONFIG.projectSkillsRoot).toBe(".opencode/project-skills");
    expect(DEFAULT_CONFIG.templateSkillsRoot).toBe(".opencode/skill");
    expect(DEFAULT_CONFIG.runtimeRoot).toBe(".opencode/.skill-mine");
  });
});

describe("loadConfig", () => {
  test("throws on missing config file", () => {
    expect(() => loadConfig(join(tmpdir(), "nonexistent-skill-mine-config.json"))).toThrow();
  });

  test("throws on unsupported schema version", () => {
    const path = join(tmpdir(), "sm-bad-version.json");
    writeFileSync(path, JSON.stringify({ ...DEFAULT_CONFIG, schemaVersion: 99 }));
    expect(() => loadConfig(path)).toThrow(/schemaVersion|version/i);
    rmSync(path, { force: true });
  });

  test("throws on negative budget", () => {
    const path = join(tmpdir(), "sm-bad-budget.json");
    writeFileSync(path, JSON.stringify({ ...DEFAULT_CONFIG, maxActiveMinedSkills: -1 }));
    expect(() => loadConfig(path)).toThrow(/maxActiveMinedSkills|budget/i);
    rmSync(path, { force: true });
  });

  test("throws on non-positive description byte budget", () => {
    const path = join(tmpdir(), "sm-bad-desc.json");
    writeFileSync(path, JSON.stringify({ ...DEFAULT_CONFIG, maxDescriptionBytes: 0 }));
    expect(() => loadConfig(path)).toThrow(/maxDescriptionBytes|budget/i);
    rmSync(path, { force: true });
  });

  test("returns typed config from a valid file", () => {
    const path = join(tmpdir(), "sm-valid.json");
    writeFileSync(path, JSON.stringify(DEFAULT_CONFIG));
    const cfg = loadConfig(path);
    expect(cfg.schemaVersion).toBe(1);
    expect(cfg.judgeVersion).toBe("v1-writing-skills");
    expect(cfg.maxActiveMinedSkills).toBe(10);
    expect(cfg.maxDescriptionBytes).toBe(240);
    expect(cfg.maxAggregateDescriptionBytes).toBe(2400);
    rmSync(path, { force: true });
  });
});

describe("bootstrapRuntime", () => {
  let runtimeRoot: string;
  let cfg: SkillMineConfig;

  beforeEach(() => {
    runtimeRoot = mkdtempSync(join(tmpdir(), "sm-runtime-"));
    cfg = { ...DEFAULT_CONFIG, runtimeRoot };
  });

  afterEach(() => {
    rmSync(runtimeRoot, { recursive: true, force: true });
  });

  test("creates all five runtime directories with 0700 permissions", () => {
    const dirs = bootstrapRuntime(cfg);
    const names = ["receipts", "traces", "candidates", "journal", "archive"] as const;
    for (const name of names) {
      expect(existsSync(dirs[name])).toBe(true);
      const mode = statSync(dirs[name]).mode & 0o777;
      expect(mode).toBe(0o700);
    }
  });

  test("is idempotent — second call does not error", () => {
    bootstrapRuntime(cfg);
    const dirs = bootstrapRuntime(cfg);
    const names = ["receipts", "traces", "candidates", "journal", "archive"] as const;
    for (const name of names) {
      expect(existsSync(dirs[name])).toBe(true);
    }
  });

  test("runtime root itself is created with 0700 when absent", () => {
    rmSync(runtimeRoot, { recursive: true, force: true });
    expect(existsSync(runtimeRoot)).toBe(false);
    bootstrapRuntime(cfg);
    const mode = statSync(runtimeRoot).mode & 0o777;
    expect(mode).toBe(0o700);
  });
});
