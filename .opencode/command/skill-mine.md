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

# 4. Retire a mined skill (move from active root to archive)
bun .opencode/tool/skill-mine/cli.ts retire <skillName>

# 5. Restore an archived skill back to its original scope
bun .opencode/tool/skill-mine/cli.ts restore <skillName>

# 6. Recover/rollback a crashed retire or restore
bun .opencode/tool/skill-mine/cli.ts recover <skillName>

# 7. Validate a quarantined candidate (admission checks)
bun .opencode/tool/skill-mine/cli.ts validate <candidateName>

# 8. Promote a candidate to its active root (evidence JSON via stdin for template scope)
bun .opencode/tool/skill-mine/cli.ts promote <candidateName> < evidence.json

# 9. Rollback a promotion (move a promoted skill back to quarantine)
bun .opencode/tool/skill-mine/cli.ts rollback <skillName>

# 10. Record manual usage (fallback when the telemetry plugin hook is unobservable)
bun .opencode/tool/skill-mine/cli.ts usage record <skillName> [--session <id>]

# 11. Print usage report for all mined skills
bun .opencode/tool/skill-mine/cli.ts usage report

# 12. Print retirement recommendations (telemetry-active, zero invocations)
bun .opencode/tool/skill-mine/cli.ts usage recommend
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

### 4. Retire and Restore

Retire moves a MINED skill (metadata.origin: skill-mine) from its active root
into the ignored archive. Hand-authored skills are never retired by this
command. Restore moves an archived skill back to its original scope root,
only when the destination is free.

```bash
bun .opencode/tool/skill-mine/cli.ts retire <skillName>
bun .opencode/tool/skill-mine/cli.ts restore <skillName>
```

If a retire or restore is interrupted, recover cleans up the stale lock and
completes or rolls back the operation based on whether the rename happened:

```bash
bun .opencode/tool/skill-mine/cli.ts recover <skillName>
```

Both operations require an opencode restart to take effect (the skill loader
is startup-scanned, not hot-reloaded).

### 5. Validate and Promote

Before promotion, validate the candidate passes all admission checks (schema,
provenance, privacy, helper smoke, collision, isolated loader):

```bash
bun .opencode/tool/skill-mine/cli.ts validate <candidateName>
```

Promote moves the candidate from quarantine into its scope-specific active
root. Promotion revalidates lint, helpers, behavioral approval, budget, and
destination. It does NOT commit or push — `/ship` owns the Git release boundary.

```bash
# Project scope (no evidence needed)
bun .opencode/tool/skill-mine/cli.ts promote <candidateName>

# Template scope (requires evidence: ≥2 projects + ≥2 modelIds)
echo '{"projects":["p1","p2"],"modelIds":["m1","m2"]}' | \
  bun .opencode/tool/skill-mine/cli.ts promote <candidateName>
```

After promotion, commit and push the new active skill via the standing
`/ship` flow. If the outer verify or push fails, rollback the promotion:

```bash
bun .opencode/tool/skill-mine/cli.ts rollback <skillName>
```

Rollback moves the skill back to quarantine so it is not left active but
unshipped. All three operations (promote, rollback, validate) require an
opencode restart to take effect in the live catalog.

### 6. Usage Telemetry

The optional `skill-mine-telemetry` plugin passively observes
`tool.execute.after` when `tool === "skill"` and appends a single
`{skill, sessionID, timestamp}` record to the ignored local log
(`.opencode/.skill-mine/usage.jsonl`, 0600). It records no prompts, content,
or output, and never breaks the observed tool call.

**Live hook proof (required once):** restart opencode, invoke a known skill,
then run `usage report`. If the skill shows invocations > 0, the plugin is
live. If invocations stay 0 (the hook does not fire on native skill calls),
use the manual fallback instead and leave the plugin installed as a no-op
safety net.

```bash
# Manual fallback: record a usage after invoking a skill
bun .opencode/tool/skill-mine/cli.ts usage record <skillName>

# Inspect usage across all mined skills (status: used | unused | unknown)
bun .opencode/tool/skill-mine/cli.ts usage report

# Get evidence-backed retirement recommendations (never auto-retires)
bun .opencode/tool/skill-mine/cli.ts usage recommend
```

Missing telemetry (no log file) marks every skill "unknown" — never "unused",
since zero invocations cannot be distinguished from an inactive observer.
Retirement recommendations only include skills where telemetry IS active but
the skill has zero invocations. Recommendations never retire automatically;
run `retire <name>` explicitly.

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
