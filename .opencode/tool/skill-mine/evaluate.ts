// Skill-Mine independent behavioral approval.
//
// An approval record is the evidence that a quarantined candidate actually
// changes agent behavior for the better: a baseline run WITHOUT the candidate
// must fail, two treatment runs WITH the candidate must pass (>=4/5), and an
// INDEPENDENT review judge must confirm. The record is content-hash-bound:
// if the candidate changes, prior approval is invalidated.
//
// Stored at `candidates/<name>/approval.json` (ignored runtime, 0600).

import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { SkillMineConfig } from "./config.js";
import { validateSkill, scanFreeText } from "./schema.js";
import { candidateDir } from "./candidate.js";

export interface RunResult {
  modelId: string;
  passed: boolean;
  /** Score out of 5; pass threshold is >= 4. */
  score: number;
  /** Sanitized summary (privacy-scanned). */
  summary: string;
}

export interface JudgeResult extends RunResult {
  rubric?: Record<string, number>;
}

export interface ApprovalInput {
  candidateName: string;
  /** Must match the current candidate's contentHash. */
  candidateHash: string;
  baseline: RunResult;
  /** Exactly 2 treatment runs. */
  treatments: RunResult[];
  judge: JudgeResult;
  /** Human confirmer (non-empty). */
  approvedBy: string;
}

export interface ApprovalRecord extends ApprovalInput {
  judgeVersion: string;
  approvedAt: string;
}

const PASS_THRESHOLD = 4;
const REQUIRED_TREATMENTS = 2;

export function approvalPath(cfg: SkillMineConfig, name: string): string {
  return join(candidateDir(cfg, name), "approval.json");
}

/**
 * Validate and persist an independent behavioral approval record.
 *
 * Guards:
 *   - Candidate must exist on disk with a matching contentHash (stale → reject).
 *   - Baseline must FAIL (proves the candidate is needed).
 *   - Exactly 2 treatments, both must pass (score >= 4).
 *   - Judge must be independent (different modelId from baseline + treatments).
 *   - Judge must pass (score >= 4).
 *   - approvedBy must be a non-empty string.
 *   - All summaries are privacy-scanned.
 */
export function recordApproval(input: ApprovalInput, cfg: SkillMineConfig): ApprovalRecord {
  const dir = candidateDir(cfg, input.candidateName);
  if (!existsSync(dir)) {
    throw new Error(`candidate directory not found: ${dir}`);
  }

  // Re-validate the candidate and compare contentHash.
  const result = validateSkill(dir, "mined-admission");
  if (!result.ok || !result.skill) {
    const msgs = result.failures.map((f) => f.message).join("; ");
    throw new Error(`candidate validation failed: ${msgs}`);
  }
  if (result.skill.contentHash !== input.candidateHash) {
    throw new Error(
      `content hash mismatch: approval references '${input.candidateHash.slice(0, 12)}' but candidate is '${result.skill.contentHash.slice(0, 12)}' (stale or modified)`,
    );
  }

  // Baseline must fail — proves the candidate is needed.
  if (input.baseline.passed) {
    throw new Error("baseline must fail (passed=true means the candidate is not needed)");
  }

  // Exactly 2 treatments, both must pass.
  if (input.treatments.length !== REQUIRED_TREATMENTS) {
    throw new Error(
      `exactly ${REQUIRED_TREATMENTS} treatments required, got ${input.treatments.length}`,
    );
  }
  for (let i = 0; i < input.treatments.length; i++) {
    const t = input.treatments[i];
    if (!t.passed) {
      throw new Error(`treatment ${i + 1} must pass (passed=false)`);
    }
    if (t.score < PASS_THRESHOLD) {
      throw new Error(`treatment ${i + 1} score ${t.score} is below threshold ${PASS_THRESHOLD}`);
    }
  }

  // Judge must be independent — different modelId from baseline + all treatments.
  const runModelIds = [input.baseline.modelId, ...input.treatments.map((t) => t.modelId)];
  if (runModelIds.includes(input.judge.modelId)) {
    throw new Error(
      `judge modelId '${input.judge.modelId}' must differ from baseline and treatment modelIds (not independent — self-judged)`,
    );
  }
  if (!input.judge.passed) {
    throw new Error("judge must pass (passed=false)");
  }
  if (input.judge.score < PASS_THRESHOLD) {
    throw new Error(`judge score ${input.judge.score} is below threshold ${PASS_THRESHOLD}`);
  }

  // Human confirmer.
  if (typeof input.approvedBy !== "string" || input.approvedBy.length === 0) {
    throw new Error("approvedBy must be a non-empty string");
  }

  // Privacy scan all summaries.
  const summaries = [
    input.baseline.summary,
    ...input.treatments.map((t) => t.summary),
    input.judge.summary,
  ];
  for (const s of summaries) {
    if (typeof s !== "string") {
      throw new Error("summary must be a string");
    }
    const failures = scanFreeText(s);
    if (failures.length > 0) {
      throw new Error(`secret detected in summary: ${failures[0].message}`);
    }
  }

  const record: ApprovalRecord = {
    ...input,
    judgeVersion: cfg.judgeVersion,
    approvedAt: new Date().toISOString(),
  };

  const path = approvalPath(cfg, input.candidateName);
  writeFileSync(path, JSON.stringify(record, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
  return record;
}

/**
 * Load a stored approval record. Returns null if:
 *   - no approval file exists, or
 *   - the candidate has changed (contentHash no longer matches).
 */
export function loadApproval(name: string, cfg: SkillMineConfig): ApprovalRecord | null {
  const path = approvalPath(cfg, name);
  if (!existsSync(path)) {
    return null;
  }

  const dir = candidateDir(cfg, name);
  if (!existsSync(dir)) {
    return null;
  }

  // Re-validate the candidate to check the hash still matches.
  const result = validateSkill(dir, "mined-admission");
  if (!result.ok || !result.skill) {
    return null; // candidate invalid or removed
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
  const record = raw as ApprovalRecord;
  if (record.candidateHash !== result.skill.contentHash) {
    return null; // candidate changed — approval invalidated
  }

  return record;
}
