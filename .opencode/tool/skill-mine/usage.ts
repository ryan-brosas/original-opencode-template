// Skill-Mine usage telemetry — pure data layer.
//
// Append-only JSONL records of skill invocations live at
// `<runtimeRoot>/usage.jsonl` (ignored runtime state, 0600). The optional
// telemetry plugin (plugin/skill-mine-telemetry.ts) appends records on
// `tool.execute.after` when `tool === "skill"`. A manual CLI fallback
// (`cli.ts usage record <name>`) appends the same record shape when the
// native hook is unobservable.

import { appendFileSync, existsSync, readFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

export interface UsageRecord {
  skill: string;
  sessionID: string;
  timestamp: number;
}

const USAGE_FILE = "usage.jsonl";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function usagePath(cfg: { runtimeRoot: string }): string {
  return join(cfg.runtimeRoot, USAGE_FILE);
}

function isString(v: unknown): v is string {
  return typeof v === "string";
}

/**
 * Validate a usage record's shape. Throws a clear error naming the bad field.
 */
function validateRecord(r: unknown): asserts r is UsageRecord {
  if (typeof r !== "object" || r === null) throw new Error("usage record must be an object");
  const rec = r as Record<string, unknown>;
  if (!isString(rec.skill) || rec.skill.length === 0 || !NAME_RE.test(rec.skill)) {
    throw new Error("usage record skill must be a non-empty kebab-case name");
  }
  if (!isString(rec.sessionID) || rec.sessionID.length === 0) {
    throw new Error("usage record sessionID must be a non-empty string");
  }
  if (typeof rec.timestamp !== "number" || !Number.isFinite(rec.timestamp) || rec.timestamp <= 0) {
    throw new Error("usage record timestamp must be a positive number");
  }
}

/**
 * Append a single usage record to the JSONL log at 0600. Records only the
 * triple `{skill, sessionID, timestamp}` — never prompts, content or output.
 */
export function appendUsage(record: UsageRecord, cfg: { runtimeRoot: string }): void {
  validateRecord(record);
  const path = usagePath(cfg);
  const line = JSON.stringify({
    skill: record.skill,
    sessionID: record.sessionID,
    timestamp: record.timestamp,
  });
  appendFileSync(path, line + "\n");
  chmodSync(path, 0o600);
}

/**
 * Read and validate all usage records, skipping malformed lines and deduping
 * exact duplicates (same skill+sessionID+timestamp). Returns an empty array
 * when the log is missing.
 */
export function readUsage(cfg: { runtimeRoot: string }): UsageRecord[] {
  const path = usagePath(cfg);
  if (!existsSync(path)) return [];
  const seen = new Set<string>();
  const out: UsageRecord[] = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      continue; // skip malformed
    }
    try {
      validateRecord(parsed);
    } catch {
      continue; // skip structurally invalid
    }
    const key = `${parsed.skill}\u0001${parsed.sessionID}\u0001${parsed.timestamp}`;
    if (seen.has(key)) continue; // dedupe exact duplicates
    seen.add(key);
    out.push(parsed);
  }
  return out;
}

export interface SkillUsageReport {
  skill: string;
  invocations: number;
  distinctSessions: number;
  lastUsed: number | null;
  status: "used" | "unused" | "unknown";
}

export interface UsageReport {
  telemetryActive: boolean;
  skills: SkillUsageReport[];
}

/**
 * Build a usage report for the named skills. Missing telemetry (no log file)
 * marks every skill as "unknown" — never "unused", since zero invocations
 * cannot be distinguished from an inactive observer. Active telemetry with
 * zero invocations for a skill marks it "unused" (truly unobserved).
 */
export function usageReport(cfg: { runtimeRoot: string }, opts: { skills: string[] }): UsageReport {
  const telemetryActive = existsSync(usagePath(cfg));
  const records = telemetryActive ? readUsage(cfg) : [];
  const bySkill = new Map<string, UsageRecord[]>();
  for (const r of records) {
    const arr = bySkill.get(r.skill) ?? [];
    arr.push(r);
    bySkill.set(r.skill, arr);
  }
  const skills: SkillUsageReport[] = opts.skills.map((name) => {
    const recs = bySkill.get(name) ?? [];
    const sessions = new Set(recs.map((r) => r.sessionID));
    const lastUsed = recs.length > 0 ? Math.max(...recs.map((r) => r.timestamp)) : null;
    let status: SkillUsageReport["status"];
    if (!telemetryActive) {
      status = "unknown";
    } else if (recs.length > 0) {
      status = "used";
    } else {
      status = "unused";
    }
    return {
      skill: name,
      invocations: recs.length,
      distinctSessions: sessions.size,
      lastUsed,
      status,
    };
  });
  return { telemetryActive, skills };
}

export interface RetirementRecommendation {
  skill: string;
  invocations: number;
  distinctSessions: number;
  lastUsed: number | null;
}

/**
 * Recommend retirement for skills that are genuinely unused: telemetry is
 * active AND the skill has zero invocations. "unknown" skills (telemetry
 * inactive) are excluded — they cannot be proven unused. Never auto-retires;
 * the caller must run `/skill-mine retire <name>` explicitly.
 */
export function recommendRetirement(
  cfg: { runtimeRoot: string },
  opts: { skills: string[] },
): RetirementRecommendation[] {
  const report = usageReport(cfg, opts);
  return report.skills
    .filter((s) => s.status === "unused")
    .map((s) => ({
      skill: s.skill,
      invocations: s.invocations,
      distinctSessions: s.distinctSessions,
      lastUsed: s.lastUsed,
    }));
}
