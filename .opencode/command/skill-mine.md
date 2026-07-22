---
description: Mine a verified work unit into a reusable skill (distill, evaluate, promote)
agent: build
---

# Skill-Mine: $ARGUMENTS

Convert verified, shipped work into a reusable OpenCode skill through a
governed lifecycle. You are the sole writer. No autonomous promotion without
explicit user confirmation.

## Prerequisites

A finalized completion receipt must exist for the work unit being mined. The
ship flow creates receipts (see `agent/build.md` — Completion Receipt). No
receipt = nothing to mine.

## Commands

```bash
# 1. Capture a shipped work unit into a sanitized trace
bun .opencode/tool/skill-mine/cli.ts capture <commitSha>

# 2. Distill a candidate skill from a trace (reads SKILL.md from stdin)
bun .opencode/tool/skill-mine/cli.ts distill <candidateName> < skill.md

# 3. Record behavioral approval (reads ApprovalInput JSON from stdin)
bun .opencode/tool/skill-mine/cli.ts evaluate <candidateName> < approval.json
```

## Lifecycle

### 1. Capture

After a work unit is verified and pushed, capture it:

```bash
bun .opencode/tool/skill-mine/cli.ts capture <commitSha>
```

This writes a sanitized `MinedTrace` to `.opencode/.skill-mine/traces/`. Only
allowlisted fields are stored — no raw prompts, tool output, or diffs.

### 2. Distill

Write a candidate `SKILL.md` based on the captured trace. The skill must
follow the `writing-skills` contract: a behavior change, not prose.

```bash
cat <<'EOF' | bun .opencode/tool/skill-mine/cli.ts distill <candidateName>
---
name: <candidateName>
description: Use when <triggering condition>...
metadata:
  origin: skill-mine
  source_commit: <40-char SHA from the trace>
  mined_date: "YYYY-MM-DD"
  judge_version: "v1-writing-skills"
  scope: "project"
  evidence_summary: "<one-line sanitized summary from the trace>"
  content_hash: "<placeholder — filled by validation>"
---

# <Title>
## Core Principle | When to Use / NOT | Workflow | Red Flags | Anti-Patterns | Contract
EOF
```

The candidate is written to quarantine (`.opencode/.skill-mine/candidates/`).
It is NOT in the active skill catalog until promoted.

### 3. Evaluate

Run an independent behavioral evaluation per the `writing-skills` methodology:

1. **Baseline (must fail):** Dispatch a `general` subagent on a pressure
   scenario WITHOUT the candidate skill. Score the result. The baseline must
   fail — this proves the candidate is needed.

2. **Treatment x2 (must pass >=4/5):** Dispatch two fresh `general` subagents
   on the same scenario WITH the candidate skill content. Both must pass with
   score >= 4/5.

3. **Independent judge:** Dispatch a `review` subagent (different modelId from
   baseline and treatments) to score the fixed rubric. The judge must pass.

4. **Record approval:** Pipe the results as JSON:

```bash
cat <<'EOF' | bun .opencode/tool/skill-mine/cli.ts evaluate <candidateName>
{
  "candidateName": "<candidateName>",
  "candidateHash": "<contentHash from validateCandidate>",
  "baseline": { "modelId": "...", "passed": false, "score": 2, "summary": "..." },
  "treatments": [
    { "modelId": "...", "passed": true, "score": 5, "summary": "..." },
    { "modelId": "...", "passed": true, "score": 4, "summary": "..." }
  ],
  "judge": { "modelId": "...", "passed": true, "score": 5, "summary": "...", "rubric": {} },
  "approvedBy": "ryan"
}
EOF
```

5. **User confirmation:** Do NOT promote without explicit user confirmation
   of promotion eligibility.

## Privacy Rules

- No raw prompts, tool output, diffs, or arbitrary command strings in
  provenance.
- Only allowlisted receipt fields enter capture.
- All summaries are privacy-scanned (credentials, private keys, high-entropy
  tokens, transcript markers, absolute home paths are rejected).
- Runtime files are 0600; runtime dirs are 0700.

## Stop Conditions

- No finalized receipt matching the commit tree → do not capture.
- Baseline passes → the candidate is not needed, do not evaluate.
- Treatment fails or judge fails → keep candidate quarantined.
- Judge is not independent (same modelId as baseline/treatments) → reject.
- Candidate changed after evaluation → prior approval invalidated.
- User does not confirm → do not promote.

## Related

- Plan: `.opencode/artifacts/skill-mine/plan.md`
- Config: `.opencode/skill-mine.json`
- Skill contract: `.opencode/skill/writing-skills/SKILL.md`
