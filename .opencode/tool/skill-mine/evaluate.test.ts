import { test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  recordApproval,
  loadApproval,
  approvalPath,
  type ApprovalInput,
  type ApprovalRecord,
} from "./evaluate.js";
import { writeCandidate } from "./candidate.js";
import type { SkillMineConfig } from "./config.js";

const VALID_MINED_SKILL = `---
name: test-candidate
description: Use when testing candidate admission with a mined skill.
metadata:
  origin: skill-mine
  source_commit: abc123def456abc123def456abc123def456abc1
  mined_date: "2026-07-22"
  judge_version: "v1-writing-skills"
  scope: "project"
  evidence_summary: "Baseline failed without skill; two treatments passed."
  content_hash: "placeholder"
---

# Test Candidate

Body text for the test candidate skill.
`;

function makeConfig(runtimeRoot: string): SkillMineConfig {
  return {
    schemaVersion: 1,
    judgeVersion: "v1-writing-skills",
    maxActiveMinedSkills: 10,
    maxDescriptionBytes: 240,
    maxAggregateDescriptionBytes: 2400,
    projectSkillsRoot: ".opencode/project-skills",
    templateSkillsRoot: ".opencode/skill",
    runtimeRoot,
  };
}

function makeValidInput(candidateHash: string): ApprovalInput {
  return {
    candidateName: "test-candidate",
    candidateHash,
    baseline: {
      modelId: "makora/test-baseline",
      passed: false,
      score: 2,
      summary: "Baseline run without candidate failed the rubric.",
    },
    treatments: [
      {
        modelId: "makora/test-treatment-1",
        passed: true,
        score: 5,
        summary: "Treatment run 1 with candidate passed the rubric.",
      },
      {
        modelId: "makora/test-treatment-2",
        passed: true,
        score: 4,
        summary: "Treatment run 2 with candidate passed the rubric.",
      },
    ],
    judge: {
      modelId: "openai/gpt-5.6-sol-fast",
      passed: true,
      score: 5,
      summary: "Independent judge confirms both treatments satisfy the rubric.",
      rubric: { ironLaw: 1, workflow: 3, redFlags: 1, contract: 1, refusedToSkip: 1 },
    },
    approvedBy: "ryan",
  };
}

let tmpRoot: string;
let cfg: SkillMineConfig;

beforeEach(() => {
  tmpRoot = mkdtempSync(join(tmpdir(), "skill-mine-eval-"));
  cfg = makeConfig(tmpRoot);
  writeCandidate(cfg, "test-candidate", VALID_MINED_SKILL);
});

afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("recordApproval rejects missing candidate directory", () => {
  rmSync(join(tmpRoot, "candidates", "test-candidate"), { recursive: true, force: true });
  expect(() => recordApproval(makeValidInput("anyhash"), cfg)).toThrow(
    /candidate.*not found|not found/i,
  );
});

test("recordApproval rejects hash mismatch (stale candidate)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const wrongHash = "0".repeat(64);
  expect(result.skill.contentHash).not.toBe(wrongHash);
  expect(() => recordApproval(makeValidInput(wrongHash), cfg)).toThrow(
    /hash.*mismatch|stale|content.*hash/i,
  );
});

test("recordApproval rejects baseline that passed (no evidence candidate is needed)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.baseline.passed = true;
  input.baseline.score = 5;
  expect(() => recordApproval(input, cfg)).toThrow(/baseline.*pass|baseline.*fail|must fail/i);
});

test("recordApproval rejects fewer than 2 treatments", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.treatments = [input.treatments[0]];
  expect(() => recordApproval(input, cfg)).toThrow(/treatment/i);
});

test("recordApproval rejects a treatment that failed (score < 4)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.treatments[1].passed = false;
  input.treatments[1].score = 2;
  expect(() => recordApproval(input, cfg)).toThrow(/treatment.*fail|treatment.*pass|score/i);
});

test("recordApproval rejects self-judged (judge modelId === baseline modelId)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.judge.modelId = input.baseline.modelId;
  expect(() => recordApproval(input, cfg)).toThrow(/judge.*independent|self.judg|judge.*model/i);
});

test("recordApproval rejects self-judged (judge modelId === treatment modelId)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.judge.modelId = input.treatments[0].modelId;
  expect(() => recordApproval(input, cfg)).toThrow(/judge.*independent|self.judg|judge.*model/i);
});

test("recordApproval rejects when judge failed", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.judge.passed = false;
  input.judge.score = 2;
  expect(() => recordApproval(input, cfg)).toThrow(/judge.*fail|judge.*pass/i);
});

test("recordApproval rejects empty approvedBy", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.approvedBy = "";
  expect(() => recordApproval(input, cfg)).toThrow(/approvedBy|approver/i);
});

test("recordApproval rejects secret in summary", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const input = makeValidInput(result.skill.contentHash);
  input.judge.summary = "Judge confirmed. Token: AKIAIOSFODNN7EXAMPLE";
  expect(() => recordApproval(input, cfg)).toThrow(/secret|credential|AWS|AKIA/i);
});

test("recordApproval succeeds with valid input and writes approval.json", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  const record = recordApproval(makeValidInput(result.skill.contentHash), cfg);
  expect(record.judgeVersion).toBe("v1-writing-skills");
  expect(record.approvedAt).toBeTruthy();
  const path = approvalPath(cfg, "test-candidate");
  const onDisk = JSON.parse(readFileSyncStr(path)) as ApprovalRecord;
  expect(onDisk.candidateName).toBe("test-candidate");
  expect(onDisk.judgeVersion).toBe("v1-writing-skills");
});

test("loadApproval returns the stored record", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  recordApproval(makeValidInput(result.skill.contentHash), cfg);
  const loaded = loadApproval("test-candidate", cfg);
  expect(loaded).not.toBeNull();
  expect(loaded!.candidateName).toBe("test-candidate");
});

test("loadApproval returns null when candidate changed (hash invalidated)", async () => {
  const { validateSkill } = await import("./schema.js");
  const result = validateSkill(join(tmpRoot, "candidates", "test-candidate"), "mined-admission");
  if (!result.ok || !result.skill) throw new Error("fixture skill invalid");
  recordApproval(makeValidInput(result.skill.contentHash), cfg);
  // Overwrite the candidate with different content → different contentHash
  const modified = VALID_MINED_SKILL.replace(
    "Body text for the test candidate skill.",
    "Different body content.",
  );
  writeCandidate(cfg, "test-candidate", modified);
  const loaded = loadApproval("test-candidate", cfg);
  expect(loaded).toBeNull();
});

test("loadApproval returns null when no approval exists", () => {
  const loaded = loadApproval("test-candidate", cfg);
  expect(loaded).toBeNull();
});

function readFileSyncStr(path: string): string {
  return readFileSyncStrImpl(path);
}

import { readFileSync as readFileSyncImpl } from "node:fs";
function readFileSyncStrImpl(path: string): string {
  return readFileSyncImpl(path, "utf8");
}
