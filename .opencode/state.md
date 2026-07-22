---
purpose: Current project state, active decisions, blockers, and position tracking
updated: 2026-07-22
---

# State

## Current Position

**Active Plan:** Plan 2 — Prompt fidelity and lean context (Plan 1 complete)
**Status:** Ready to start Plan 2
**Started:** 2026-07-22
**Phase:** Template Harness v2

## Recent Completed Work

| When | Work | Summary |
| ---- | ---- | ------- |
| 2026-07-22 | `/init --deep` + `--context` | Created AGENTS.md, tech-stack.md, roadmap.md, state.md |
| 2026-07-22 | Deep research (scout/explore/review) | Evidence for verifier-centered harness; old maintenance roadmap rejected |
| 2026-07-22 | Model config tuning | `small_model` → gpt-5.4-mini; all `gpt-5.6-sol` → `gpt-5.6-sol-fast` |
| 2026-07-22 | Plan persisted | `.opencode/artifacts/template-harness-v2/plan.md` + roadmap/state/MEMORY updated |
| 2026-07-22 | Plan 1 shipped | `verify.sh` (deterministic offline runner), `structural-check.sh` PASS-after-FAIL fix, `verify.md` read-only adapter, `ship.md` linear single-writer (502→142 lines); verify.sh green (exit 0) |

## Active Decisions

| Date | Decision | Rationale |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------- |
| 2026-07-22 | Replace maintenance-first roadmap with verifier-centered harness | Research evidence favors linear loop, structured verification, prompt fidelity |
| 2026-07-22 | Simplify aggressively: remove prompt-leverage + session-summary | User selected; prompts reach model unrewritten, compaction at phase boundaries |
| 2026-07-22 | `.opencode/` canonical; `template/.opencode` export deferred | Sync is not first-class; export deferred to a release mechanism |
| 2026-07-22 | `structural-check.sh` exits 1 on failure (not 0) | Verified: docs were stale; real bug is misleading PASS-after-FAIL message |

## Blockers

| Bead | Blocker | Since | Owner |
| ------ | ------- | ----- | ----- |
| — | (none) | — | — |

## Context Notes

### Technical

- `structural-check.sh` **exits 1 on failure** — docs claiming "exits 0" are stale and wrong. Real bug: unconditional `pass "All files within size limits"` at line 92 printed after a recorded size violation.
- `prompt-leverage.ts` removed (Plan 2) — previously rewrote every substantive user prompt. No longer active on disk; takes effect after opencode restart.
- `session-summary.ts` + helpers removed (Plan 2) — previously injected `<session_summary>` every turn. Takes effect after restart.
- No typecheck/test suite: `typescript` not a dep; `npx tsc` is a stub. Bun compile smoke (Plan 1) is not semantic typecheck.
- `opencode.json instructions[]` empty → root AGENTS.md not auto-injected.

### Product

- Template consumed by personal projects (e.g. `personal-website/.opencode/opencode.json`).
- Scope is personal use; external onboarding out of scope.

## Next Actions

1. [ ] Plan 2 Task 1: remove 5 session-summary files (`session-summary.ts` + `session-summary/{persist,serialize,tracking,types}.ts`)
2. [ ] Plan 2 Task 2: remove `prompt-leverage.ts`; update `plugin/README.md` + `README.md`
3. [ ] Plan 2 Task 3: restart + forced-compaction continuity test (preserves intent/paths/next step)

## Session Handoff

**Last Session:** 2026-07-22 (research → model tuning → plan persistence)
**Next Session Priority:** Execute Plan 1 (verifier + ship loop)
**Known Issues:** ship.md 502 lines; no verification harness; prompt-leverage/session-summary active
**Context Links:** `AGENTS.md`, `.opencode/roadmap.md`, `.opencode/artifacts/template-harness-v2/plan.md`, `.opencode/artifacts/MEMORY.md`

---

_Update at the end of each significant session or when state changes._
_This file is the "you are here" marker for the project._
