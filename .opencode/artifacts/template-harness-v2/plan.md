---
slug: template-harness-v2
purpose: Replace maintenance-first roadmap with a minimal, verifier-centered OpenCode template harness
updated: 2026-07-22
---

# Template Harness v2 — Verifier-Centered

## Goal

Make the OpenCode template a lean, reliable, personal-use coding harness: one
truthful verifier, one primary writer, bounded read-only specialists, and
prompt fidelity. No hidden prompt rewriting, no ambient context injection, no
default multi-agent swarms.

## Non-goals

- Vector/graph memory, always-on repo maps, heavy telemetry, benchmark infra
- `plugin/sdk/` until two plugins share a contract
- TypeScript devDep / semantic typecheck while `package.json` is gitignored
- Automated `.opencode` ↔ `template/.opencode` sync
- Default multi-agent swarms / parallel writer fan-out

## Must-have truths

1. User prompts reach the model without hidden rewriting.
2. One command returns truthful, reproducible verification results.
3. The primary build agent is the only writer.
4. Specialists are bounded, read-only, and cannot recursively delegate.
5. Compaction preserves intent and next steps without every-turn injection.

## Plans (ordered, sequential)

### Plan 1 — Truthful verification and shipping loop

**Verify:** `bash .opencode/tool/verify.sh` exits 1 before `ship.md` trim, 0 after;
`ship.md` ≤ 150 lines; per-check output never prints PASS after a recorded FAIL.

1. Create `.opencode/tool/verify.sh` (deterministic, offline, no-cache runner:
   JSON/config validation, structural checks, Bun compile smoke,
   `git diff --check`); fix `.opencode/tool/structural-check.sh` PASS-after-FAIL
   bug; correct stale exit-code claims in `.opencode/tech-stack.md` and `AGENTS.md`.
2. Rewrite `.opencode/command/verify.md` as a read-only adapter around `verify.sh`
   (drop cache, `--fix`, active-artifact prereqs, MEMORY/progress writes).
3. Rewrite `.opencode/command/ship.md` as linear `localize → patch → verify →
   evidence` (single writer; ≤1 read-only review for high-risk; no waves, no
   5-agent fan-out, no mandatory commits).

**Risk:** Bun compile smoke is not semantic typecheck — label it honestly.
**Depends on:** nothing.

### Plan 2 — Prompt fidelity and lean context

**Verify:** `rg -n 'experimental\.chat\.(messages|system)\.transform|PromptLeverage|SessionSummaryPlugin' .opencode/plugin` → no matches; forced-compaction test preserves intent + paths + next step.

1. Remove 5 session-summary files (`session-summary.ts` + `session-summary/{persist,serialize,tracking,types}.ts`).
2. Remove `prompt-leverage.ts`; update `plugin/README.md` and `README.md`.
3. Restart; forced-compaction continuity test.

**Risk:** Removing session-summary loses its compaction anchor — built-in compaction must prove equivalent or a compaction-only hook stays.
**Depends on:** Plan 1.

### Plan 3 — Align direct execution

**Verify:** `rg -n 'batch-implement|5 parallel|Wave-Based|per-task commit'` in ship/fix/build → no active routing; `/ship` smoke with no `.opencode/artifacts/.active` accepts a direct request.

1. Rewrite `fix.md` + align `build.md` (reproduce→localize→patch→verify→evidence; finalize build permissions here).
2. Mark swarm execution dormant: `workflows/batch-implement.md`, `workflows/development-lifecycle-workflow.md`, `README.md`.
3. Smoke-test `/ship` without active artifacts.

**Risk:** Making `general` read-only (Plan 4) kills `batch-implement` — remove all active routes first.
**Depends on:** Plan 2.

### Plan 4 — Effective permission boundaries

**Verify:** `opencode debug config --pure` parses; for general/explore/review/scout, `tools.apply_patch === false && tools.task === false` via `opencode debug agent <name> --pure`.

1. Centralize defaults in `opencode.json`; narrow `plan.md` to planning-artifact writes.
2. Deny-first shell policies + `task: false` + `apply_patch: false` for general/explore/review/scout.
3. Inspect resolved permissions for every agent after restart.

**Risk:** `bash: "*": allow` defeats `edit: false` — need deny-first shell allowlists, verified from resolved config not YAML.
**Depends on:** Plan 3.

## Stop conditions

- Verification fails 2× on same approach → stop, preserve evidence, escalate.
- Removing session-summary loses compaction continuity → keep a compaction-only hook, do not restore every-turn injection.
- Narrow permissions break a real workflow → widen that one rule with evidence, do not revert to broad defaults.

## Evidence base

Research (arXiv + official docs, 2026-07-22): Agentless/mini-SWE-Agent (linear
loop beats swarms); AdaMAST/DISC (structured verification > self-reflection);
Token-Reduction-Is-Not-Cost-Reduction (preserve edit anchors); Anthropic/Letta
context-engineering (short instructions + selective retrieval + phase compaction);
OpenCode docs (instructions, agent permissions, hooks, compaction, session
export/import cover these without new infra). Full bibliography in session research.
