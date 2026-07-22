import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import {
  scanMinedSkills,
  checkBudget,
  checkTemplatePromotionEvidence,
  type PromotionEvidence,
} from "./budget.js";

let roots: string[] = [];

function tempCfg(): SkillMineConfig {
  const root = mkdtempSync(join(tmpdir(), "sm-budget-"));
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

function placeMinedSkill(
  root: string,
  name: string,
  scope: "project" | "template",
  description = `Use when testing ${name} workflows.`,
): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: ${description}`,
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
      "Body.",
      "",
    ].join("\n"),
  );
  return dir;
}

function placeHandAuthoredSkill(root: string, name: string): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      "description: A hand-authored skill.",
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

beforeEach(() => {
  roots = [];
});
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("scanMinedSkills", () => {
  test("returns empty when no mined skills exist", () => {
    const cfg = tempCfg();
    const skills = scanMinedSkills(cfg);
    expect(skills).toEqual([]);
  });

  test("finds a mined project skill", () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const skills = scanMinedSkills(cfg);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("probe");
    expect(skills[0].scope).toBe("project");
  });

  test("finds a mined template skill", () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.templateSkillsRoot, "tmpl", "template");
    const skills = scanMinedSkills(cfg);
    expect(skills.length).toBe(1);
    expect(skills[0].scope).toBe("template");
  });

  test("ignores hand-authored skills (no metadata.origin: skill-mine)", () => {
    const cfg = tempCfg();
    placeHandAuthoredSkill(cfg.projectSkillsRoot, "handmade");
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const skills = scanMinedSkills(cfg);
    expect(skills.length).toBe(1);
    expect(skills[0].name).toBe("probe");
  });
});

describe("checkBudget", () => {
  test("passes when under all limits", () => {
    const cfg = tempCfg();
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    const check = checkBudget(cfg);
    expect(check.ok).toBe(true);
    expect(check.count).toBe(1);
    expect(check.failures).toEqual([]);
  });

  test("fails when count exceeds max", () => {
    const root = mkdtempSync(join(tmpdir(), "sm-budget-max-"));
    roots.push(root);
    const cfgPath = join(root, "skill-mine.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          ...DEFAULT_CONFIG,
          maxActiveMinedSkills: 1,
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
    placeMinedSkill(cfg.projectSkillsRoot, "a", "project");
    placeMinedSkill(cfg.templateSkillsRoot, "b", "template");
    const check = checkBudget(cfg);
    expect(check.ok).toBe(false);
    expect(check.count).toBe(2);
    expect(check.maxCount).toBe(1);
    expect(check.failures.some((f) => /count|exceed/i.test(f))).toBe(true);
  });

  test("fails when a description exceeds per-description max", () => {
    const root = mkdtempSync(join(tmpdir(), "sm-budget-desc-"));
    roots.push(root);
    const cfgPath = join(root, "skill-mine.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          ...DEFAULT_CONFIG,
          maxDescriptionBytes: 10,
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
    placeMinedSkill(
      cfg.projectSkillsRoot,
      "probe",
      "project",
      "This description is way longer than ten bytes.",
    );
    const check = checkBudget(cfg);
    expect(check.ok).toBe(false);
    expect(check.failures.some((f) => /description|bytes|exceed/i.test(f))).toBe(true);
  });

  test("fails when aggregate description bytes exceeds max", () => {
    const root = mkdtempSync(join(tmpdir(), "sm-budget-agg-"));
    roots.push(root);
    const cfgPath = join(root, "skill-mine.json");
    writeFileSync(
      cfgPath,
      JSON.stringify(
        {
          ...DEFAULT_CONFIG,
          maxAggregateDescriptionBytes: 50,
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
    placeMinedSkill(
      cfg.projectSkillsRoot,
      "a",
      "project",
      "Description that is thirty bytes long exactly.",
    );
    placeMinedSkill(
      cfg.templateSkillsRoot,
      "b",
      "template",
      "Another thirty-byte description here now.",
    );
    const check = checkBudget(cfg);
    expect(check.ok).toBe(false);
    expect(check.failures.some((f) => /aggregate|total|exceed/i.test(f))).toBe(true);
  });
});

describe("checkTemplatePromotionEvidence", () => {
  test("passes with at least 2 projects and 2 modelIds", () => {
    const evidence: PromotionEvidence = {
      projects: ["personal-website", "opencode-template"],
      modelIds: ["makora/GLM-5.2", "openai/gpt-5.6-sol-fast"],
    };
    const result = checkTemplatePromotionEvidence(evidence);
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
  });

  test("fails with only 1 project", () => {
    const evidence: PromotionEvidence = {
      projects: ["personal-website"],
      modelIds: ["makora/GLM-5.2", "openai/gpt-5.6-sol-fast"],
    };
    const result = checkTemplatePromotionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => /project/i.test(f))).toBe(true);
  });

  test("fails with only 1 modelId", () => {
    const evidence: PromotionEvidence = {
      projects: ["personal-website", "opencode-template"],
      modelIds: ["makora/GLM-5.2"],
    };
    const result = checkTemplatePromotionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.some((f) => /model|runtime/i.test(f))).toBe(true);
  });

  test("fails with empty evidence", () => {
    const evidence: PromotionEvidence = { projects: [], modelIds: [] };
    const result = checkTemplatePromotionEvidence(evidence);
    expect(result.ok).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(1);
  });
});
