// Skill-Mine health check — verifies the installation is sound.
//
// doctor checks: config loads, runtime dirs exist, no stale locks, budget
// within limits, and telemetry file presence. Returns a structured report.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillMineConfig } from "./config.js";
import { checkBudget, scanMinedSkills } from "./budget.js";

export interface DoctorReport {
  config: { ok: boolean; path: string };
  runtimeDirs: { ok: boolean; missing: string[] };
  locks: { ok: boolean; stale: string[] };
  budget: { ok: boolean; count: number; max: number };
  telemetry: { active: boolean; path: string };
  overall: { ok: boolean; failures: string[] };
}

const RUNTIME_DIR_NAMES = ["receipts", "traces", "candidates", "journal", "archive"] as const;

export function doctorCheck(cfg: SkillMineConfig): DoctorReport {
  const failures: string[] = [];

  // 1. Config — already loaded by the caller, so always ok here. Report the
  //    path for diagnostics.
  const configOk = true;

  // 2. Runtime dirs — all 5 must exist.
  const missing: string[] = [];
  for (const name of RUNTIME_DIR_NAMES) {
    if (!existsSync(join(cfg.runtimeRoot, name))) {
      missing.push(name);
    }
  }
  const runtimeDirsOk = missing.length === 0;
  if (!runtimeDirsOk) failures.push(`missing runtime dirs: ${missing.join(", ")}`);

  // 3. Stale locks — scan journal dir for in-progress entries.
  const stale: string[] = [];
  const journalDir = join(cfg.runtimeRoot, "journal");
  if (existsSync(journalDir)) {
    for (const file of readdirSync(journalDir)) {
      if (!file.endsWith(".json")) continue;
      const skillName = file.replace(/\.json$/, "");
      try {
        const entry = JSON.parse(readFileSync(join(journalDir, file), "utf8"));
        if (entry && entry.status === "in-progress") {
          stale.push(skillName);
        }
      } catch {
        // Malformed journal entry — skip (recover handles cleanup).
      }
    }
  }
  const locksOk = stale.length === 0;
  if (!locksOk) failures.push(`stale locks: ${stale.join(", ")}`);

  // 4. Budget — mined skill count vs max.
  const mined = scanMinedSkills(cfg);
  const budgetCheck = checkBudget(cfg);
  const budgetOk = budgetCheck.ok;
  if (!budgetOk)
    failures.push(`budget exceeded: ${String(mined.length)}/${String(cfg.maxActiveMinedSkills)}`);

  // 5. Telemetry — usage.jsonl presence.
  const usagePath = join(cfg.runtimeRoot, "usage.jsonl");
  const telemetryActive = existsSync(usagePath);

  // Overall.
  const overallOk = configOk && runtimeDirsOk && locksOk && budgetOk;

  return {
    config: { ok: configOk, path: "skill-mine.json" },
    runtimeDirs: { ok: runtimeDirsOk, missing },
    locks: { ok: locksOk, stale },
    budget: { ok: budgetOk, count: mined.length, max: cfg.maxActiveMinedSkills },
    telemetry: { active: telemetryActive, path: usagePath },
    overall: { ok: overallOk, failures },
  };
}
