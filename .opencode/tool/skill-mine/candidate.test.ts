import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
  existsSync,
  readFileSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import { candidateDir, writeCandidate, smokeHelpers, validateCandidate } from "./candidate.js";

let roots: string[] = [];

function tempCfg(): SkillMineConfig {
  const root = mkdtempSync(join(tmpdir(), "sm-cand-"));
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
  return cfg;
}

function minedSkillMd(name: string, body = "Test body for the skill."): string {
  return [
    "---",
    `name: ${name}`,
    `description: Use when testing ${name} admission workflows.`,
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
    `# ${name}`,
    "",
    body,
    "",
  ].join("\n");
}

beforeEach(() => {
  roots = [];
});
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("candidateDir", () => {
  test("returns the quarantine path for a name", () => {
    const cfg = tempCfg();
    const dir = candidateDir(cfg, "probe-skill");
    expect(dir).toContain("candidates");
    expect(dir).toContain("probe-skill");
  });
});

describe("writeCandidate", () => {
  test("writes SKILL.md inside quarantine at 0700", () => {
    const cfg = tempCfg();
    const dir = writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill"));
    expect(existsSync(join(dir, "SKILL.md"))).toBe(true);
    const st = statSync(dir);
    expect((st.mode & 0o777).toString(8)).toBe("700");
  });

  test("rejects an invalid name", () => {
    const cfg = tempCfg();
    expect(() => writeCandidate(cfg, "UPPERCASE", minedSkillMd("UPPERCASE"))).toThrow();
    expect(() => writeCandidate(cfg, "../escape", minedSkillMd("escape"))).toThrow();
  });

  test("writes helper scripts alongside SKILL.md", () => {
    const cfg = tempCfg();
    const dir = writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill"), {
      "search.js": "console.log('hello');\n",
    });
    expect(existsSync(join(dir, "search.js"))).toBe(true);
  });
});

describe("smokeHelpers", () => {
  test("passes when no helper files exist", () => {
    const cfg = tempCfg();
    const dir = writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill"));
    const result = smokeHelpers(dir);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  test("passes for syntactically valid JS", () => {
    const cfg = tempCfg();
    const dir = writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill"), {
      "helper.js": "export function add(a, b) { return a + b; }\n",
    });
    const result = smokeHelpers(dir);
    expect(result.ok).toBe(true);
  });

  test("fails for broken JS", () => {
    const cfg = tempCfg();
    const dir = writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill"), {
      "broken.js": "function broken( { return ; ",
    });
    const result = smokeHelpers(dir);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

describe("validateCandidate", () => {
  test("rejects a candidate missing provenance metadata", () => {
    const cfg = tempCfg();
    const genericMd = [
      "---",
      "name: probe-skill",
      "description: A generic skill without mined provenance.",
      "---",
      "",
      "# probe-skill",
      "",
      "Body.",
      "",
    ].join("\n");
    writeCandidate(cfg, "probe-skill", genericMd);
    expect(validateCandidate(cfg, "probe-skill", process.cwd())).rejects.toThrow(
      /provenance|metadata/i,
    );
  });

  test("rejects a candidate with a secret in the body", () => {
    const cfg = tempCfg();
    const secretBody = "Uses key AKIAIOSFODNN7EXAMPLE for auth.";
    writeCandidate(cfg, "probe-skill", minedSkillMd("probe-skill", secretBody));
    expect(validateCandidate(cfg, "probe-skill", process.cwd())).rejects.toThrow(
      /AWS|access key|candidate validation failed/i,
    );
  });

  test("rejects a name that collides with the live catalog", () => {
    const cfg = tempCfg();
    writeCandidate(cfg, "memory", minedSkillMd("memory"));
    expect(validateCandidate(cfg, "memory", process.cwd())).rejects.toThrow(/collision|already/i);
  });
});
