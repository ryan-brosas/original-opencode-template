import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, bootstrapRuntime, DEFAULT_CONFIG, type SkillMineConfig } from "./config.js";
import {
  appendUsage,
  readUsage,
  usageReport,
  recommendRetirement,
  type UsageRecord,
} from "./usage.js";

let roots: string[] = [];

function tempCfg(): SkillMineConfig {
  const root = mkdtempSync(join(tmpdir(), "sm-usage-"));
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

function record(skill: string, sessionID: string, timestamp: number): UsageRecord {
  return { skill, sessionID, timestamp };
}

beforeEach(() => {
  roots = [];
});
afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
});

describe("appendUsage", () => {
  test("writes a valid record to usage.jsonl at 0600", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 1_000_000), cfg);
    const path = join(cfg.runtimeRoot, "usage.jsonl");
    expect(existsSync(path)).toBe(true);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  test("appends a second record on a new line", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 1_000_000), cfg);
    appendUsage(record("other", "ses-2", 2_000_000), cfg);
    const recs = readUsage(cfg);
    expect(recs.length).toBe(2);
  });

  test("rejects an empty skill name", () => {
    const cfg = tempCfg();
    expect(() => appendUsage(record("", "ses-1", 1_000_000), cfg)).toThrow(/skill/i);
  });

  test("rejects a non-string sessionID", () => {
    const cfg = tempCfg();
    expect(() =>
      appendUsage({ skill: "probe", sessionID: 123 as unknown as string, timestamp: 1 }, cfg),
    ).toThrow(/session/i);
  });

  test("rejects a non-positive timestamp", () => {
    const cfg = tempCfg();
    expect(() => appendUsage(record("probe", "ses-1", 0), cfg)).toThrow(/timestamp/i);
    expect(() => appendUsage(record("probe", "ses-1", -5), cfg)).toThrow(/timestamp/i);
  });

  test("records only {skill, sessionID, timestamp} — no prompts, content or output", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 1_000_000), cfg);
    const recs = readUsage(cfg);
    expect(recs.length).toBe(1);
    const keys = Object.keys(recs[0]).sort();
    expect(keys).toEqual(["sessionID", "skill", "timestamp"]);
  });
});

describe("readUsage", () => {
  test("returns an empty array when the file is missing", () => {
    const cfg = tempCfg();
    expect(readUsage(cfg)).toEqual([]);
  });

  test("skips malformed lines and keeps valid ones", () => {
    const cfg = tempCfg();
    const path = join(cfg.runtimeRoot, "usage.jsonl");
    writeFileSync(
      path,
      [
        JSON.stringify(record("probe", "ses-1", 100)),
        "not json at all",
        "{broken",
        JSON.stringify(record("other", "ses-2", 200)),
        "",
      ].join("\n") + "\n",
      { mode: 0o600 },
    );
    const recs = readUsage(cfg);
    expect(recs.length).toBe(2);
    expect(recs[0].skill).toBe("probe");
    expect(recs[1].skill).toBe("other");
  });

  test("dedupes exact duplicate lines (same skill+sessionID+timestamp)", () => {
    const cfg = tempCfg();
    const path = join(cfg.runtimeRoot, "usage.jsonl");
    const dup = JSON.stringify(record("probe", "ses-1", 100));
    writeFileSync(path, [dup, dup, dup].join("\n") + "\n", { mode: 0o600 });
    const recs = readUsage(cfg);
    expect(recs.length).toBe(1);
  });

  test("keeps legitimately repeated invocations (same skill, different session)", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 100), cfg);
    appendUsage(record("probe", "ses-2", 200), cfg);
    expect(readUsage(cfg).length).toBe(2);
  });
});

describe("usageReport", () => {
  test("missing telemetry → telemetryActive=false and all skills 'unknown'", () => {
    const cfg = tempCfg();
    // No usage.jsonl written.
    const report = usageReport(cfg, { skills: ["probe", "other"] });
    expect(report.telemetryActive).toBe(false);
    expect(report.skills.every((s) => s.status === "unknown")).toBe(true);
  });

  test("telemetry active + skill with records → 'used' with counts + lastUsed", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 100), cfg);
    appendUsage(record("probe", "ses-2", 300), cfg);
    appendUsage(record("probe", "ses-1", 200), cfg);
    const report = usageReport(cfg, { skills: ["probe"] });
    expect(report.telemetryActive).toBe(true);
    const probe = report.skills.find((s) => s.skill === "probe")!;
    expect(probe.status).toBe("used");
    expect(probe.invocations).toBe(3);
    expect(probe.distinctSessions).toBe(2);
    expect(probe.lastUsed).toBe(300);
  });

  test("telemetry active + skill with no records → 'unused' (NOT 'unknown')", () => {
    const cfg = tempCfg();
    appendUsage(record("probe", "ses-1", 100), cfg);
    const report = usageReport(cfg, { skills: ["probe", "never-invoked"] });
    expect(report.telemetryActive).toBe(true);
    const never = report.skills.find((s) => s.skill === "never-invoked")!;
    expect(never.status).toBe("unused");
    expect(never.invocations).toBe(0);
    expect(never.lastUsed).toBeNull();
  });

  test("missing telemetry does NOT report a skill as 'unused' — only 'unknown'", () => {
    const cfg = tempCfg();
    const report = usageReport(cfg, { skills: ["probe"] });
    const probe = report.skills.find((s) => s.skill === "probe")!;
    expect(probe.status).not.toBe("unused");
    expect(probe.status).toBe("unknown");
  });
});

describe("recommendRetirement", () => {
  test("recommends only 'unused' skills (telemetry active, zero invocations)", () => {
    const cfg = tempCfg();
    appendUsage(record("used-one", "ses-1", 100), cfg);
    const recs = recommendRetirement(cfg, { skills: ["used-one", "stale-skill"] });
    expect(recs.length).toBe(1);
    expect(recs[0].skill).toBe("stale-skill");
    expect(recs[0].invocations).toBe(0);
  });

  test("excludes 'unknown' skills when telemetry is missing", () => {
    const cfg = tempCfg();
    const recs = recommendRetirement(cfg, { skills: ["probe", "other"] });
    expect(recs).toEqual([]);
  });

  test("never auto-retires — returns recommendations only", () => {
    const cfg = tempCfg();
    appendUsage(record("used", "ses-1", 100), cfg);
    const recs = recommendRetirement(cfg, { skills: ["used", "stale"] });
    // Recommendations are returned; no skill directory is moved.
    const staleDir = join(cfg.projectSkillsRoot, "stale");
    expect(existsSync(staleDir)).toBe(false);
    expect(Array.isArray(recs)).toBe(true);
  });

  test("includes evidence (invocation count) in the recommendation", () => {
    const cfg = tempCfg();
    appendUsage(record("used", "ses-1", 100), cfg);
    const recs = recommendRetirement(cfg, { skills: ["used", "stale-a", "stale-b"] });
    expect(recs.every((r) => typeof r.invocations === "number")).toBe(true);
    expect(recs.every((r) => r.invocations === 0)).toBe(true);
  });
});
