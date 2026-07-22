import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import { retire, restore, recover, promote, rollbackPromote } from "./lifecycle.js";
import { candidateDir } from "./candidate.js";
import { validateSkill } from "./schema.js";

let roots: string[] = [];

function tempCfg(overrides: Record<string, unknown> = {}): SkillMineConfig {
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
        ...overrides,
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

// --- Promote + rollbackPromote tests ---

/**
 * Place a valid mined candidate in quarantine (candidates/<name>/) with a
 * matching behavioral approval record. The approval's candidateHash is
 * computed from the actual SKILL.md content via validateSkill.
 */
function placeCandidateWithApproval(
  cfg: SkillMineConfig,
  name: string,
  scope: "project" | "template",
  body = "Mined skill body.",
): string {
  const dir = candidateDir(cfg, name);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const skillMd = [
    "---",
    `name: ${name}`,
    `description: Use when testing ${name} promotion.`,
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
  ].join("\n");
  writeFileSync(join(dir, "SKILL.md"), skillMd, { mode: 0o600 });

  // Compute the real content hash via validateSkill.
  const result = validateSkill(dir, "mined-admission");
  if (!result.ok || !result.skill) {
    throw new Error(
      `test setup: invalid candidate '${name}': ${result.failures.map((f) => f.message).join("; ")}`,
    );
  }
  const contentHash = result.skill.contentHash;

  const approval = {
    candidateName: name,
    candidateHash: contentHash,
    baseline: {
      modelId: "m-baseline",
      passed: false,
      score: 1,
      summary: "baseline failed without skill",
    },
    treatments: [
      { modelId: "m-treat-1", passed: true, score: 5, summary: "treatment 1 passed" },
      { modelId: "m-treat-2", passed: true, score: 5, summary: "treatment 2 passed" },
    ],
    judge: { modelId: "m-judge", passed: true, score: 5, summary: "judge confirmed improvement" },
    approvedBy: "test-user",
    judgeVersion: cfg.judgeVersion,
    approvedAt: "2026-07-22T00:00:00.000Z",
  };
  writeFileSync(join(dir, "approval.json"), JSON.stringify(approval, null, 2), { mode: 0o600 });
  return dir;
}

describe("promote", () => {
  test("rejects when the candidate is not in quarantine", async () => {
    const cfg = tempCfg();
    expect(promote("nonexistent", cfg)).rejects.toThrow(/not found|quarantine|candidate/i);
  });

  test("rejects absent lint approval (broken schema)", async () => {
    const cfg = tempCfg();
    const dir = candidateDir(cfg, "broken");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(dir, "SKILL.md"),
      ["---", "name: broken", "description: x", "---", "", "# broken", ""].join("\n"),
      { mode: 0o600 },
    );
    expect(promote("broken", cfg)).rejects.toThrow(/lint|provenance|metadata|validation/i);
  });

  test("rejects absent behavioral approval", async () => {
    const cfg = tempCfg();
    const dir = candidateDir(cfg, "probe");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(
      join(dir, "SKILL.md"),
      [
        "---",
        "name: probe",
        "description: Use when testing probe promotion.",
        "metadata:",
        "  origin: skill-mine",
        "  source_commit: aabbccddee112233445566778899001122334455",
        '  mined_date: "2026-07-22"',
        "  judge_version: v1-writing-skills",
        "  scope: project",
        '  evidence_summary: "Baseline failed; two treatments passed 5/5."',
        '  content_hash: "0000000000000000000000000000000000000000000000000000000000000000"',
        "---",
        "",
        "# probe",
        "",
        "Body.",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    expect(promote("probe", cfg)).rejects.toThrow(/approval|behavioral/i);
  });

  test("rejects stale content hash (candidate changed after approval)", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    // Modify the candidate body after approval — hash no longer matches.
    const dir = candidateDir(cfg, "probe");
    writeFileSync(
      join(dir, "SKILL.md"),
      [
        "---",
        "name: probe",
        "description: Use when testing probe promotion.",
        "metadata:",
        "  origin: skill-mine",
        "  source_commit: aabbccddee112233445566778899001122334455",
        '  mined_date: "2026-07-22"',
        "  judge_version: v1-writing-skills",
        "  scope: project",
        '  evidence_summary: "Baseline failed; two treatments passed 5/5."',
        '  content_hash: "0000000000000000000000000000000000000000000000000000000000000000"',
        "---",
        "",
        "# probe",
        "",
        "CHANGED BODY — hash no longer matches approval.",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );
    expect(promote("probe", cfg)).rejects.toThrow(/stale|hash mismatch|changed|invalid/i);
  });

  test("rejects active lock (stale journal)", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
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
    expect(promote("probe", cfg)).rejects.toThrow(/in progress|lock|busy/i);
  });

  test("rejects destination collision (active root already has the skill)", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    placeMinedSkill(cfg.projectSkillsRoot, "probe", "project");
    expect(promote("probe", cfg)).rejects.toThrow(/collision|already exists/i);
  });

  test("rejects budget overflow (projected count exceeds max)", async () => {
    const cfg = tempCfg({ maxActiveMinedSkills: 1 });
    placeMinedSkill(cfg.projectSkillsRoot, "existing", "project");
    placeCandidateWithApproval(cfg, "probe", "project");
    expect(promote("probe", cfg)).rejects.toThrow(/budget|exceed/i);
  });

  test("rejects template scope without evidence", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "tmpl", "template");
    expect(promote("tmpl", cfg)).rejects.toThrow(/evidence|template/i);
  });

  test("rejects template scope with insufficient evidence (1 project)", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "tmpl", "template");
    expect(
      promote("tmpl", cfg, { evidence: { projects: ["p1"], modelIds: ["m1", "m2"] } }),
    ).rejects.toThrow(/evidence|projects/i);
  });

  test("promotes a project-scope candidate to the project root", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    const dest = await promote("probe", cfg);
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(join(dest, "SKILL.md"))).toBe(true);
    expect(existsSync(join(dest, "approval.json"))).toBe(true);
    // Candidate dir is gone (renamed, not copied).
    expect(existsSync(candidateDir(cfg, "probe"))).toBe(false);
  });

  test("promotes a template-scope candidate with valid evidence", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "tmpl", "template");
    const dest = await promote("tmpl", cfg, {
      evidence: { projects: ["p1", "p2"], modelIds: ["m1", "m2"] },
    });
    expect(existsSync(dest)).toBe(true);
    expect(existsSync(join(cfg.templateSkillsRoot, "tmpl", "SKILL.md"))).toBe(true);
  });
});

describe("rollbackPromote", () => {
  test("moves a promoted skill back to quarantine", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    await promote("probe", cfg);
    await rollbackPromote("probe", cfg);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(false);
    expect(existsSync(candidateDir(cfg, "probe"))).toBe(true);
    expect(existsSync(join(candidateDir(cfg, "probe"), "SKILL.md"))).toBe(true);
  });

  test("rejects when the skill is not in any active root", async () => {
    const cfg = tempCfg();
    expect(rollbackPromote("nonexistent", cfg)).rejects.toThrow(/not found|missing|active/i);
  });

  test("rejects a non-mined skill", async () => {
    const cfg = tempCfg();
    placeHandAuthoredSkill(cfg.projectSkillsRoot, "handmade");
    expect(rollbackPromote("handmade", cfg)).rejects.toThrow(/not a mined skill|origin/i);
  });
});

describe("recover promote", () => {
  test("completes an in-progress promote whose rename happened", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    // Manually complete the rename (move candidate to active root) + leave stale journal.
    const { renameSync } = await import("node:fs");
    renameSync(candidateDir(cfg, "probe"), join(cfg.projectSkillsRoot, "probe"));
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    writeFileSync(
      join(journalDir, "probe.json"),
      JSON.stringify({
        operation: "promote",
        skillName: "probe",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    await recover("probe", cfg);
    expect(existsSync(join(journalDir, "probe.json"))).toBe(false);
    // Skill stays in the active root (rename happened).
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(true);
  });

  test("rolls back an in-progress promote whose rename did NOT happen", async () => {
    const cfg = tempCfg();
    placeCandidateWithApproval(cfg, "probe", "project");
    // Leave the candidate in quarantine + a stale in-progress promote journal.
    const journalDir = join(cfg.runtimeRoot, "journal");
    mkdirSync(journalDir, { recursive: true });
    writeFileSync(
      join(journalDir, "probe.json"),
      JSON.stringify({
        operation: "promote",
        skillName: "probe",
        scope: "project",
        status: "in-progress",
        startedAt: new Date().toISOString(),
      }),
    );
    await recover("probe", cfg);
    expect(existsSync(join(journalDir, "probe.json"))).toBe(false);
    // Candidate stays in quarantine (rename never happened).
    expect(existsSync(candidateDir(cfg, "probe"))).toBe(true);
    expect(existsSync(join(cfg.projectSkillsRoot, "probe"))).toBe(false);
  });
});
