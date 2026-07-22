---
purpose: Current project state, active decisions, blockers, and position tracking
updated: 2026-07-22
---

# State

## Current Position

**Active Plan:** semantic-typecheck — plan ready (awaiting `/ship`)
**Status:** `/plan` complete; spec/prd reconciled; plan.md written; no implementation yet
**Started:** 2026-07-22
**Phase:** semantic-typecheck — Plan written, ready to ship

## Recent Completed Work

| When | Work | Summary |
| ---- | ---- | ------- |
| 2026-07-22 | `/init --deep` + `--context` | Created AGENTS.md, tech-stack.md, roadmap.md, state.md |
| 2026-07-22 | Deep research (scout/explore/review) | Evidence for verifier-centered harness; old maintenance roadmap rejected |
| 2026-07-22 | Model config tuning | `small_model` → gpt-5.4-mini; all `gpt-5.6-sol` → `gpt-5.6-sol-fast` |
| 2026-07-22 | Plan persisted | `.opencode/artifacts/template-harness-v2/plan.md` + roadmap/state/MEMORY updated |
| 2026-07-22 | Plan 1 shipped | `verify.sh` (deterministic offline runner), `structural-check.sh` PASS-after-FAIL fix, `verify.md` read-only adapter, `ship.md` linear single-writer (502→142 lines); verify.sh green (exit 0) |
| 2026-07-22 | Plan 2 shipped | Removed `prompt-leverage.ts` + `session-summary.ts` + 4 helpers; updated plugin/README.md, README.md, AGENTS.md; verify.sh green |
| 2026-07-22 | Pushed to GitHub | Public repo `ryan-brosas/original-opencode-template`; commit `0b429a7` (24 files, +1091/-1639); `template/` excluded (Model A) |
| 2026-07-22 | Restart + continuity check | opencode restarted; prompt-leverage/session-summary no longer loaded (verified: prompts arrive unwrapped); state.md updated as continuity mechanism |
| 2026-07-22 | Plan 3 shipped | Rewrote `fix.md` (verify.sh loop, no guessed npm), aligned `build.md` (sole writer, finalized permissions), marked batch-implement + dev-lifecycle DORMANT; verify.sh green |
| 2026-07-22 | Plan 4 Tasks 1-2 on disk | Narrowed `plan.md` bash to deny-first; added `task:false`+`apply_patch:false`+deny-first bash to general/explore/review/scout; general→read-only; `task:false` confirmed via debug; needs restart for full verification |
| 2026-07-22 | Plan 4 complete + committed | After restart, verified all 4 specialists read-only via `opencode debug agent` (last-match-wins); found+fixed write-bypass gap (explore/review write:deny); committed `0a1a4f9`, pushed to GitHub |
| 2026-07-22 | Deferred items resolved | (1) wired `instructions:["AGENTS.md"]` (root map was NOT auto-injected); (2) `tool/sync-template.sh` export mechanism + reconciled `template/.opencode` (594 files, manifest regenerated); (3) README dead refs + stale `npm run` Verification Baseline fixed; (4) `plugin/sdk/` audit: no shared contract → deferred; verify.sh green, diff clean |
| 2026-07-22 | Auto-ship wired | `build.md` commits+pushes after verify.sh exits 0 on a completed work unit; `git commit`/`push` flipped ask→allow, force-push + hook-bypass denied; `/ship` Close rewritten to reference the standing rule |
| 2026-07-22 | Auto-ship landed | After restart, build agent loaded allow; committed `df05bc5` (4 files), pushed `f63f03d..df05bc5 main -> main`. Auto-ship is LIVE. Gotcha learned: commit message body must not contain the literal `--no-verify` or it trips the `*--no-verify*` deny rule |
| 2026-07-22 | `/plan semantic-typecheck` | Plan written (448 lines, 4 plans/8 tasks); spec/prd reconciled with review-audit corrections (Check 4/5, nested gitignore trim, plugin/tsconfig, isolated regression test, generic export, finalization); pins `typescript@7.0.2`+`@types/bun@1.3.14`+`@types/node@24.12.2`; awaiting `/ship` |

## Active Decisions

| Date | Decision | Rationale |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------- |
| 2026-07-22 | Replace maintenance-first roadmap with verifier-centered harness | Research evidence favors linear loop, structured verification, prompt fidelity |
| 2026-07-22 | Simplify aggressively: remove prompt-leverage + session-summary | User selected; prompts reach model unrewritten, compaction at phase boundaries |
| 2026-07-22 | `.opencode/` canonical; `template/.opencode` export deferred | Sync is not first-class; export deferred to a release mechanism |
| 2026-07-22 | `structural-check.sh` exits 1 on failure (not 0) | Verified: docs were stale; real bug is misleading PASS-after-FAIL message |
| 2026-07-22 | Auto ship on completion: commit + push after verify | User wants per-artifact auto commit+push; verify.sh is the gate; subagents stay read-only; force-push + hook-bypass denied |

## Blockers

| Bead | Blocker | Since | Owner |
| ------ | ------- | ----- | ----- |
| — | (none) | — | — |

## Context Notes

### Technical

- `structural-check.sh` **exits 1 on failure** — docs claiming "exits 0" are stale and wrong. Real bug: unconditional `pass "All files within size limits"` at line 92 printed after a recorded size violation.
- `prompt-leverage.ts` removed (Plan 2) — confirmed gone after restart: prompts arrive unwrapped (no Objective/Context/Work Style framework).
- `session-summary.ts` + helpers removed (Plan 2) — confirmed gone after restart: no `<session_summary>` block in context. Continuity now relies on file-based memory (this file + MEMORY.md + progress.md), not every-turn injection.
- No typecheck/test suite: `typescript` not a dep; `npx tsc` is a stub. Bun compile smoke (Plan 1) is not semantic typecheck.
- `opencode.json instructions: ["AGENTS.md"]` wired — root `AGENTS.md` (project map) now auto-injected alongside `.opencode/AGENTS.md` (kernel, native). Verified: my system prompt carried only `.opencode/AGENTS.md` before wiring. Requires restart to take effect.

### Product

- Template consumed by personal projects (e.g. `personal-website/.opencode/opencode.json`).
- Scope is personal use; external onboarding out of scope.

## Next Actions

1. [x] Plan 2 Task 1: remove session-summary files — done
2. [x] Plan 2 Task 2: remove prompt-leverage.ts + update docs — done
3. [x] Plan 2 Task 3: restart + continuity check — done (file-based state complete; plugins confirmed unloaded)
4. [x] Plan 3 Task 1: rewrite `fix.md` + align `build.md` (finalize build permissions) — done
5. [x] Plan 3 Task 2: mark swarm routing dormant — done
6. [x] Plan 3 Task 3: smoke-test `/ship` without `.active` — done (ship.md:25 disowns requirement)
7. [x] Plan 4 Task 1: narrow `plan.md` bash to deny-first read-only — done
8. [x] Plan 4 Task 2: deny-first shell + task:false + apply_patch:false for general/explore/review/scout — done
9. [x] Plan 4 Task 3: restart + verify resolved permissions — done (all read-only confirmed; write gap found+fixed; committed 0a1a4f9)
10. [x] Deferred item 1: README dead refs + stale Verification Baseline — done
11. [x] Deferred item 2: wire `instructions:["AGENTS.md"]` + fix tech-stack.md claim — done (needs restart to verify injection)
12. [x] Deferred item 3: `tool/sync-template.sh` export mechanism + reconcile `template/.opencode` — done (594 files, manifest regenerated, diff clean)
13. [x] Deferred item 4: `plugin/sdk/` audit — no shared contract found, remains deferred (not speculative)
14. [x] `/plan semantic-typecheck` — plan written + spec/prd reconciled; awaiting `/ship`

## Session Handoff

**Last Session:** 2026-07-22 (`/plan semantic-typecheck` complete: plan.md written, spec/prd reconciled with review-audit corrections, progress.md + state.md updated)
**Next Session Priority:** `/ship semantic-typecheck` — execute the 4-plan TDD sequence. First write-enabled action: apply the Planning Corrections (spec/prd already reconciled), then Plan 1 Task 1 (install `typescript@7.0.2`+`@types/bun@1.3.14`+`@types/node@24.12.2`, trim nested `.gitignore`, capture RED). Treat the whole artifact as one work unit — no interim auto-ship commit until the final verification battery passes. Stop if tsc reveals >10 baseline errors or an API refactor.
**Known Issues:** (none — plan ready; spec/prd reconciled)
**Context Links:** `.opencode/artifacts/semantic-typecheck/{spec,plan,progress,prd.json}`, `AGENTS.md`, `.opencode/roadmap.md`, `.opencode/artifacts/MEMORY.md`
**Repo:** https://github.com/ryan-brosas/original-opencode-template (public, main)

---

_Update at the end of each significant session or when state changes._
_This file is the "you are here" marker for the project._
