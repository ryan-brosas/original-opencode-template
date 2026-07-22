import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import { retire, restore, recover } from "./lifecycle.js";

let roots: string[] = [];

function tempCfg(): SkillMineConfig {
  const root = mkdtempSync(join(tmpdir(), "sm-life-"));
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

/** Place a mined skill directly into an active root (simulates promotion). */
function placeMinedSkill(
  root: string,
  name: string,
  scope: "project" | "template",
  body = "Mined skill body.",
): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: Use when testing ${name} retirement.`,
      "metadata:",
      "  origin: skill-mine",
      "  source_commit: aabbccddee112233445566778899001122334455",
      '  mined_date: "2026-07-22"',
      "  judge_version: v1-writing-skills",
      `  scope: ${scope}`,
      '  evidence_summary: "Baseline failed; two treatments passed 5/5."',
      '  content_hash: "0000000000000000000000000000000000000000000000000000000000000000"',
      "---",
      "",
      `# ${name}`,
      "",
      body,
      "",
    ].join("\n"),
  );
  return dir;
}

/** Place a hand-authored (non-mined) skill into an active root. */
function placeHandAuthoredSkill(root: string, name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: A hand-authored skill.`,
      "---",
      "",
      `# ${name}`,
      "",
      "Body.",
      "",
    ].join("\n"),
  );
  return dir;
}

function archivedDir(cfg: SkillMineConfig, name: string): string {
  return join(cfg.runtimeRoot, "archive", name);
}

beforeEach(() => {
  roots = [];
});
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("retire", () => {
  test("moves a mined project skill into the archive", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    await retire("probe", cfg);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(false);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(true);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe", "SKILL.md"))).toBe(true);
  });

  test("moves a mined template skill into the archive", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.templateSkillsRoot, "tmpl", "template");
    await retire("tmpl", cfg);
    expect(existsSync(join(cfg.templateSkillsRoot, "tmpl"))).toBe(false);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "tmpl"))).toBe(true);
  });

  test("rejects a non-mined (hand-authored) skill", async () => {
    const cfg = tempCfg();
    placeHandAuthoredSkill(cfg.projectSkillsRoot, "handmade");
    expect(retire("handmade", cfg)).rejects.toThrow(/not a mined skill|origin|mined/i);
    expect(existsSync(join(cfg.projectSkillsRoot, "handmade"))).toBe(true);
  });

  test("rejects a skill that does not exist in any active root", async () => {
    const cfg = tempCfg();
    expect(retire("nonexistent", cfg)).rejects.toThrow(/not found|missing|absent/i);
  });
});

describe("restore", () => {
  test("moves an archived skill back to its original project scope", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    await retire("probe", cfg);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(true);
    await restore("probe", cfg);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(false);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe", "SKILL.md"))).toBe(true);
  });

  test("moves an archived skill back to its original template scope", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.templateSkillsRoot, "tmpl", "template");
    await retire("tmpl", cfg);
    await restore("tmpl", cfg);
    expect(existsSync(join(cfg.templateSkillsRoot, "tmpl", "SKILL.md"))).toBe(true);
  });

  test("rejects restore when the destination is occupied (collision)", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    await retire("probe", cfg);
    // Re-occupy the project slot with a different skill.
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project", "replacement body");
    expect(restore("probe", cfg)).rejects.toThrow(/collision|occupied|already exists/i);
    // Archive copy must remain untouched after a rejected restore.
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(true);
  });

  test("rejects restore when the skill is not in the archive", async () => {
    const cfg = tempCfg();
    expect(restore("nonexistent", cfg)).rejects.toThrow(/not found|missing|archive/i);
  });
});

describe("idempotency", () => {
  test("retire then restore then retire then restore works twice", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    await retire("probe", cfg);
    await restore("probe", cfg);
    await retire("probe", cfg);
    await restore("probe", cfg);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe", "SKILL.md"))).toBe(true);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(false);
  });
});

describe("lock and recovery", () => {
  test("rejects an operation when a stale lock exists for the same name", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    // Simulate a stale lock by writing an in-progress journal entry.
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    writeFileSync(
      join(journalDir, "probe.json"),
      JSON.stringify({
        operation: "retire",
        skillName: "probe",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    expect(retire("probe", cfg)).rejects.toThrow(/in progress|lock|busy/i);
  });

  test("recover completes an in-progress retire whose rename already happened", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    // Manually move the skill to the archive (rename happened) but leave a
    // stale in-progress journal.
    const { renameSync } = await import("node:fs");
    renameSync(join(cfg.projectSkillsRoot, "probe"), join(cfg.runtimeRoot, "archive", "probe"));
    writeFileSync(
      join(journalDir, "probe.json"),
      JSON.stringify({
        operation: "retire",
        skillName: "probe",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    await recover("probe", cfg);
    // The journal should be cleaned up (completed/removed).
    expect(existsSync(join(journalDir, "probe.json"))).toBe(false);
    // Skill stays in the archive (rename already happened).
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(true);
  });

  test("recover rolls back an in-progress retire whose rename did NOT happen", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    // Leave a stale in-progress journal but do NOT move the skill.
    writeFileSync(
      join(journalDir, "probe.json"),
      JSON.stringify({
        operation: "retire",
        skillName: "probe",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    await recover("probe", cfg);
    expect(existsSync(join(journalDir, "probe.json"))).toBe(false);
    // Skill stays in the active root (rename never happened).
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(true);
    expect(existsSync(join(cfg.runtimeRoot, "archive", "probe"))).toBe(false);
  });

  test("recover handles a malformed journal by removing it", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    writeFileSync(join(journalDir, "probe.json"), "not valid json {{{");
    await recover("probe", cfg);
    expect(existsSync(join(journalDir, "probe.json"))).toBe(false);
    // Skill untouched.
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(true);
  });

  test("recover is a no-op when no journal exists", async () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    await recover("probe", cfg);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(true);
  });
});
