---
purpose: Project roadmap with phases, milestones, and bead organization
updated: 2026-07-22
---

# Roadmap

## Overview

Replace the maintenance-first roadmap with a minimal, verifier-centered
OpenCode template harness for personal use: one truthful verifier, one primary
writer, bounded read-only specialists, and prompt fidelity.

Research basis: Agentless/mini-SWE-Agent (linear loop), AdaMAST/DISC
(structured verification > self-reflection), Anthropic/Letta (short instructions
+ selective retrieval + phase compaction), OpenCode docs (no new infra needed).
Full plan: `.opencode/artifacts/template-harness-v2/plan.md`.

| Plan | Goal | Status | Depends On |
| ---- | ----------------------------------------------- | ----------- | ---------- |
| 1 · Truthful verify | Deterministic offline verifier + linear `/ship` | Not Started | - |
| 2 · Prompt fidelity | Remove hidden prompt rewriting + ambient injection | Not Started | Plan 1 |
| 3 · Direct execution | Align `/fix` + build; disable swarm routing | Not Started | Plan 2 |
| 4 · Permissions | Least-privilege effective agent boundaries | Not Started | Plan 3 |

## Must-have truths

1. User prompts reach the model without hidden rewriting.
2. One command returns truthful, reproducible verification results.
3. The primary build agent is the only writer.
4. Specialists are bounded, read-only, and cannot recursively delegate.
5. Compaction preserves intent and next steps without every-turn injection.

## Plan 1: Truthful verification and shipping loop

**Goal:** `/verify` and `/ship` produce real evidence — no caches, guessed npm
scripts, network downloads, or mandatory plan artifacts.

**Success Criteria:**

- [ ] `bash .opencode/tool/verify.sh` exits 1 before `ship.md` trim, 0 after
- [ ] Per-check output never prints PASS after a recorded FAIL
- [ ] `command/ship.md` ≤ 150 lines, single-writer `localize → patch → verify → evidence`
- [ ] `structural-check.sh` no longer prints "All files within size limits" after a violation

**Tasks:**

1. Create `.opencode/tool/verify.sh` (offline, no-cache: JSON/config, structural,
   Bun compile smoke, `git diff --check`); fix `structural-check.sh`
   PASS-after-FAIL bug; correct stale exit-code claims in `tech-stack.md` + `AGENTS.md`.
2. Rewrite `command/verify.md` as a read-only adapter around `verify.sh`.
3. Rewrite `command/ship.md` as a linear single-writer workflow.

**Risk:** Bun compile smoke is not semantic typecheck — label it honestly.

---

## Plan 2: Prompt fidelity and lean context

**Goal:** Remove hidden prompt transformation and duplicate ambient session context.

**Success Criteria:**

- [ ] No plugin hooks `experimental.chat.{messages,system}.transform`
- [ ] Forced-compaction test preserves intent, modified paths, constraints, next step

**Tasks:**

1. Remove 5 session-summary files.
2. Remove `prompt-leverage.ts`; update `plugin/README.md` + `README.md`.
3. Restart; forced-compaction continuity test.

**Risk:** If built-in compaction loses continuity, keep a compaction-only hook —
do not restore every-turn injection.

---

## Plan 3: Align direct execution

**Goal:** `/fix`, `/ship`, and build agent use the same single-writer workflow.

**Success Criteria:**

- [ ] No active `batch-implement`/wave/5-agent routing in ship/fix/build
- [ ] `/ship` accepts a direct request without `.opencode/artifacts/.active`

**Tasks:**

1. Rewrite `fix.md` + align `build.md` (finalize build permissions here).
2. Mark swarm execution dormant in workflows + README.
3. Smoke-test `/ship` without active artifacts.

**Risk:** Plan 4 makes `general` read-only — remove all swarm routes first.

---

## Plan 4: Effective permission boundaries

**Goal:** Build agent stays capable; all specialists are actually read-only.

**Success Criteria:**

- [ ] `opencode debug config --pure` parses
- [ ] For general/explore/review/scout: `tools.apply_patch === false && tools.task === false`

**Tasks:**

1. Centralize defaults in `opencode.json`; narrow `plan.md` to artifact writes.
2. Deny-first shell policies + `task: false` + `apply_patch: false` for specialists.
3. Inspect resolved permissions for every agent after restart.

**Risk:** `bash: "*": allow` defeats `edit: false` — verify resolved config, not YAML.

---

## Deferred

- `plugin/sdk/` until two plugins share a contract
- TypeScript devDep / semantic typecheck while `package.json` is gitignored
- Vector/graph memory; always-on repo maps; heavy telemetry; benchmark infra
- Automated `.opencode` ↔ `template/.opencode` sync
- Default multi-agent swarms

## Stop conditions

- Verification fails 2× on same approach → stop, preserve evidence, escalate.
- Removing session-summary loses compaction continuity → keep compaction-only hook.
- Narrow permissions break a real workflow → widen one rule with evidence.

---

## Legend

**Status:** `Not Started` · `In Progress` · `Complete`

_Update this file when plans complete or the roadmap changes._
_Use `/plan` for detailed plans; executable spec at `.opencode/artifacts/template-harness-v2/plan.md`._
