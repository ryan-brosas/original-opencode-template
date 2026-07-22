// Skill-Mine lifecycle: retire, restore, and crash recovery.
//
// retire: move a MINED skill (metadata.origin: skill-mine) from its active root
//   (project or template scope) into the ignored archive. Hand-authored skills
//   are never retired by this module.
// restore: move an archived skill back to its original scope root, only when
//   the destination is free (no collision).
//
// Both operations use a lock + operation journal + same-filesystem rename for
// atomicity. Recovery/rollback handles incomplete operations after a crash:
//   - if the rename already happened (skill is at the destination), complete
//   - if the rename did NOT happen (skill is still at the source), roll back

import {
  existsSync,
  mkdirSync,
  renameSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { SkillMineConfig } from "./config.js";
import { validateSkill } from "./schema.js";
import { candidateDir, smokeHelpers } from "./candidate.js";
import { loadApproval } from "./evaluate.js";
import { scanMinedSkills, checkTemplatePromotionEvidence } from "./budget.js";

export type Operation = "retire" | "restore" | "promote" | "rollback-promote";
export type Scope = "project" | "template";

export interface JournalEntry {
  operation: Operation;
  skillName: string;
  scope: Scope;
  status: "in-progress" | "completed";
  startedAt: string;
}

function journalPath(cfg: SkillMineConfig, name: string): string {
  return join(cfg.runtimeRoot, "journal", `${name}.json`);
}

function archiveDir(cfg: SkillMineConfig, name: string): string {
  return join(cfg.runtimeRoot, "archive", name);
}

function activeDir(cfg: SkillMineConfig, name: string, scope: Scope): string {
  return join(scope === "project" ? cfg.projectSkillsRoot : cfg.templateSkillsRoot, name);
}

/** Read a skill's scope from its frontmatter metadata.scope. Returns null if not mined or unreadable. */
function readScope(skillDir: string): Scope | null {
  const result = validateSkill(skillDir, "mined-admission");
  if (!result.ok || !result.skill) return null;
  const scope = result.skill.metadata.scope;
  return scope === "project" || scope === "template" ? scope : null;
}

/** Validate that the skill at skillDir is a mined skill (metadata.origin: skill-mine). */
function isMined(skillDir: string): boolean {
  const result = validateSkill(skillDir, "mined-admission");
  return result.ok && !!result.skill;
}

function writeJournal(cfg: SkillMineConfig, entry: JournalEntry): void {
  const dir = join(cfg.runtimeRoot, "journal");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = journalPath(cfg, entry.skillName);
  writeFileSync(path, JSON.stringify(entry, null, 2), { mode: 0o600 });
}

function readJournal(cfg: SkillMineConfig, name: string): JournalEntry | null {
  const path = journalPath(cfg, name);
  if (!existsSync(path)) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null; // malformed
  }
  const e = raw as Partial<JournalEntry>;
  if (
    typeof e.operation !== "string" ||
    typeof e.skillName !== "string" ||
    typeof e.scope !== "string" ||
    typeof e.status !== "string" ||
    typeof e.startedAt !== "string"
  ) {
    return null; // malformed
  }
  return e as JournalEntry;
}

function clearJournal(cfg: SkillMineConfig, name: string): void {
  const path = journalPath(cfg, name);
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort
    }
  }
}

/**
 * Retire a mined skill: move it from its active root into the archive.
 * Rejects hand-authored skills (metadata.origin !== skill-mine).
 */
export async function retire(name: string, cfg: SkillMineConfig, _cwd?: string): Promise<void> {
  // Reject if a stale in-progress journal exists (another operation crashed).
  const existing = readJournal(cfg, name);
  if (existing && existing.status === "in-progress") {
    throw new Error(
      `operation in progress for '${name}': ${existing.operation} (stale lock — run recover)`,
    );
  }

  // Find the skill in its active root. Check both scopes.
  let scope: Scope | null = null;
  let sourceDir: string | null = null;
  for (const s of ["project", "template"] as Scope[]) {
    const dir = activeDir(cfg, name, s);
    if (existsSync(dir)) {
      if (!isMined(dir)) {
        throw new Error(
          `'${name}' is not a mined skill (metadata.origin !== skill-mine); refusing to retire`,
        );
      }
      const readS = readScope(dir);
      if (readS !== s) {
        throw new Error(
          `scope mismatch: skill at ${dir} declares scope '${readS}' but lives under '${s}' root`,
        );
      }
      scope = s;
      sourceDir = dir;
      break;
    }
  }
  if (!scope || !sourceDir) {
    throw new Error(`mined skill '${name}' not found in any active root`);
  }

  const destDir = archiveDir(cfg, name);

  writeJournal(cfg, {
    operation: "retire",
    skillName: name,
    scope,
    status: "in-progress",
    startedAt: new Date().toISOString(),
  });

  // Same-filesystem rename (both under cfg.runtimeRoot's parent or close).
  renameSync(sourceDir, destDir);

  clearJournal(cfg, name);
}

/**
 * Restore an archived skill back to its original scope root.
 * Rejects when the destination is occupied (collision).
 */
export async function restore(name: string, cfg: SkillMineConfig, _cwd?: string): Promise<void> {
  // Reject if a stale in-progress journal exists.
  const existing = readJournal(cfg, name);
  if (existing && existing.status === "in-progress") {
    throw new Error(
      `operation in progress for '${name}': ${existing.operation} (stale lock — run recover)`,
    );
  }

  const sourceDir = archiveDir(cfg, name);
  if (!existsSync(sourceDir)) {
    throw new Error(`archived skill '${name}' not found in the archive`);
  }

  if (!isMined(sourceDir)) {
    throw new Error(`'${name}' in the archive is not a mined skill`);
  }

  const scope = readScope(sourceDir);
  if (!scope) {
    throw new Error(`archived skill '${name}' has no valid scope`);
  }

  const destDir = activeDir(cfg, name, scope);
  if (existsSync(destDir)) {
    throw new Error(`restore collision: destination '${destDir}' already exists`);
  }

  writeJournal(cfg, {
    operation: "restore",
    skillName: name,
    scope,
    status: "in-progress",
    startedAt: new Date().toISOString(),
  });

  renameSync(sourceDir, destDir);

  clearJournal(cfg, name);
}

/**
 * Promote a quarantined candidate into its scope-specific active root.
 *
 * Guards: lint revalidation, helper smoke, behavioral approval (content-hash
 * bound), budget projection, destination collision, scope evidence (template).
 * Acquires a lock, writes a journal, atomically renames candidate→active.
 * Does NOT run Git operations — /ship owns the release boundary.
 */
export interface PromoteOptions {
  /** Required for template-scope promotion (≥2 projects + ≥2 modelIds). */
  evidence?: { projects: string[]; modelIds: string[] };
  /** Working directory; reserved for future git checks. */
  cwd?: string;
}

/**
 * Promote a quarantined candidate into its scope-specific active root.
 *
 * Guards: lint revalidation, helper smoke, behavioral approval (content-hash
 * bound), budget projection, destination collision, scope evidence (template).
 * Acquires a lock, writes a journal, atomically renames candidate→active.
 * Does NOT run Git operations — /ship owns the release boundary.
 */
export async function promote(
  name: string,
  cfg: SkillMineConfig,
  opts: PromoteOptions = {},
): Promise<string> {
  // 1. Stale lock check.
  const existing = readJournal(cfg, name);
  if (existing && existing.status === "in-progress") {
    throw new Error(
      `operation in progress for '${name}': ${existing.operation} (stale lock — run recover)`,
    );
  }

  // 2. Candidate must exist in quarantine.
  const srcDir = candidateDir(cfg, name);
  if (!existsSync(srcDir)) {
    throw new Error(`candidate '${name}' not found in quarantine`);
  }

  // 3. Revalidate lint (schema + provenance + privacy).
  const result = validateSkill(srcDir, "mined-admission");
  if (!result.ok || !result.skill) {
    const msgs = result.failures.map((f) => f.message).join("; ");
    throw new Error(`candidate lint failed: ${msgs}`);
  }
  const scope = result.skill.metadata.scope;
  if (scope !== "project" && scope !== "template") {
    throw new Error(`candidate has invalid scope: '${scope}'`);
  }

  // 4. Revalidate helper scripts.
  const smoke = smokeHelpers(srcDir);
  if (!smoke.ok) {
    throw new Error(`helper smoke failed: ${smoke.errors.join("; ")}`);
  }

  // 5. Behavioral approval must exist + contentHash must match.
  const approval = loadApproval(name, cfg);
  if (!approval) {
    throw new Error(`no valid behavioral approval for '${name}' (missing or stale content hash)`);
  }
  if (approval.candidateHash !== result.skill.contentHash) {
    throw new Error(`stale approval: candidate changed after approval (hash mismatch)`);
  }

  // 6. Scope evidence (template only).
  if (scope === "template") {
    if (!opts.evidence) {
      throw new Error("template-scope promotion requires evidence (≥2 projects + ≥2 modelIds)");
    }
    const ev = checkTemplatePromotionEvidence(opts.evidence);
    if (!ev.ok) {
      throw new Error(`template promotion evidence insufficient: ${ev.failures.join("; ")}`);
    }
  }

  // 7. Budget check (projected count + candidate description bytes).
  const existingSkills = scanMinedSkills(cfg);
  const projectedCount = existingSkills.length + 1;
  if (projectedCount > cfg.maxActiveMinedSkills) {
    throw new Error(
      `promotion would exceed budget: ${projectedCount} > max ${cfg.maxActiveMinedSkills}`,
    );
  }
  const candidateDescBytes = Buffer.byteLength(result.skill.description, "utf8");
  if (candidateDescBytes > cfg.maxDescriptionBytes) {
    throw new Error(
      `candidate description ${candidateDescBytes} bytes exceeds per-skill max ${cfg.maxDescriptionBytes}`,
    );
  }
  const projectedAggregate =
    existingSkills.reduce((sum, s) => sum + s.descriptionBytes, 0) + candidateDescBytes;
  if (projectedAggregate > cfg.maxAggregateDescriptionBytes) {
    throw new Error(
      `promotion would exceed aggregate description budget: ${projectedAggregate} > max ${cfg.maxAggregateDescriptionBytes}`,
    );
  }

  // 8. Destination collision (check both active roots).
  for (const s of ["project", "template"] as Scope[]) {
    const dest = activeDir(cfg, name, s);
    if (existsSync(dest)) {
      throw new Error(`destination collision: '${dest}' already exists`);
    }
  }

  // 9. Acquire lock, journal, atomic rename.
  const destDir = activeDir(cfg, name, scope);
  writeJournal(cfg, {
    operation: "promote",
    skillName: name,
    scope,
    status: "in-progress",
    startedAt: new Date().toISOString(),
  });

  renameSync(srcDir, destDir);

  clearJournal(cfg, name);
  return destDir;
}

/**
 * Rollback a promotion: move a promoted skill back to quarantine.
 * Called by the build agent after an outer /ship verify or release failure.
 */
export async function rollbackPromote(
  name: string,
  cfg: SkillMineConfig,
  _cwd?: string,
): Promise<void> {
  // Stale lock check.
  const existing = readJournal(cfg, name);
  if (existing && existing.status === "in-progress") {
    throw new Error(
      `operation in progress for '${name}': ${existing.operation} (stale lock — run recover)`,
    );
  }

  // Find the skill in its active root.
  let scope: Scope | null = null;
  let srcDir: string | null = null;
  for (const s of ["project", "template"] as Scope[]) {
    const dir = activeDir(cfg, name, s);
    if (existsSync(dir)) {
      if (!isMined(dir)) {
        throw new Error(
          `'${name}' is not a mined skill (metadata.origin !== skill-mine); refusing to rollback`,
        );
      }
      scope = s;
      srcDir = dir;
      break;
    }
  }
  if (!scope || !srcDir) {
    throw new Error(`mined skill '${name}' not found in any active root`);
  }

  const destDir = candidateDir(cfg, name);
  if (existsSync(destDir)) {
    throw new Error(`rollback collision: candidate dir '${destDir}' already exists`);
  }

  writeJournal(cfg, {
    operation: "rollback-promote",
    skillName: name,
    scope,
    status: "in-progress",
    startedAt: new Date().toISOString(),
  });

  renameSync(srcDir, destDir);

  clearJournal(cfg, name);
}

/**
 * Recover from a crashed/interrupted operation. Examines the journal:
 *   - in-progress retire + skill is in the archive → rename happened → complete (clear journal)
 *   - in-progress retire + skill is still in the active root → rename did NOT happen → roll back (clear journal)
 *   - in-progress restore + skill is in the active root → rename happened → complete (clear journal)
 *   - in-progress restore + skill is still in the archive → rename did NOT happen → roll back (clear journal)
 *   - malformed/missing journal → remove it (best-effort)
 */
export async function recover(name: string, cfg: SkillMineConfig, _cwd?: string): Promise<void> {
  const path = journalPath(cfg, name);

  // No journal → no-op.
  if (!existsSync(path)) return;

  // Malformed journal → remove it.
  const entry = readJournal(cfg, name);
  if (!entry) {
    try {
      unlinkSync(path);
    } catch {
      // best-effort
    }
    return;
  }

  if (entry.status !== "in-progress") {
    // Already completed or unknown status → clear.
    clearJournal(cfg, name);
    return;
  }

  const archive = archiveDir(cfg, name);
  const active = activeDir(cfg, name, entry.scope);

  if (entry.operation === "retire") {
    if (existsSync(archive)) {
      // Rename happened → complete.
      clearJournal(cfg, name);
    } else {
      // Rename did NOT happen → roll back (skill stays in active root).
      clearJournal(cfg, name);
    }
  } else if (entry.operation === "restore") {
    if (existsSync(active)) {
      // Rename happened → complete.
      clearJournal(cfg, name);
    } else {
      // Rename did NOT happen → roll back (skill stays in archive).
      clearJournal(cfg, name);
    }
  } else if (entry.operation === "promote") {
    // Promote: source = candidate dir (quarantine), dest = active root.
    if (existsSync(active)) {
      // Rename happened → complete.
      clearJournal(cfg, name);
    } else {
      // Rename did NOT happen → roll back (skill stays in quarantine).
      clearJournal(cfg, name);
    }
  } else if (entry.operation === "rollback-promote") {
    // Rollback-promote: source = active root, dest = candidate dir (quarantine).
    if (existsSync(active)) {
      // Rename did NOT happen → roll back (skill stays in active root).
      clearJournal(cfg, name);
    } else {
      // Rename happened → complete (skill is back in quarantine).
      clearJournal(cfg, name);
    }
  } else {
    clearJournal(cfg, name);
  }
}
