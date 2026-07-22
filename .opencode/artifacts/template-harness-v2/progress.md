# Progress Log

<!-- Append-only checkpoint log for this feature. -->

## 2026-07-22 — Plan 1 complete (truthful verification + linear ship)

- Created `.opencode/tool/verify.sh`: 4 deterministic offline checks (config, structural, Bun compile smoke, git diff). Exits 1 on any failure; no network, no cache.
- Fixed `.opencode/tool/structural-check.sh`: size section now guards its `pass` (no more misleading "All files within size limits" after a recorded violation). Added `SIZE_FAIL` tracking.
- Rewrote `.opencode/command/verify.md`: 161 → 62 lines, read-only adapter around `verify.sh` (dropped cache, `--fix`, artifact prereqs, MEMORY/progress writes that contradicted the review agent's read-only rule).
- Rewrote `.opencode/command/ship.md`: 502 → 142 lines, linear `localize → patch → verify → evidence` single-writer workflow (dropped waves, 5-agent fan-out, iterative score loop, mandatory commits).
- Corrected stale exit-code claims in `.opencode/tech-stack.md` and root `AGENTS.md` ("exits 0 on failure" → "exits 1 on failure"); added `verify.sh` to the Commands table.
- Persisted roadmap: `.opencode/artifacts/template-harness-v2/plan.md`, `.opencode/roadmap.md`, `.opencode/state.md`, `.opencode/artifacts/MEMORY.md` decision (supersedes maintenance-first roadmap).

Verification: `bash .opencode/tool/verify.sh` → `[OK] All verification checks passed`, exit 0.

## 2026-07-22 — Plan 2 Tasks 1-2 complete (prompt fidelity)

- Removed `prompt-leverage.ts` (silently rewrote every substantive user prompt with Objective/Context/Work Style framework).
- Removed `session-summary.ts` + 4 helpers (`session-summary/{persist,serialize,tracking,types}.ts`) — injected `<session_summary>` into every system transform.
- Updated `.opencode/plugin/README.md`: plugin list now reflects on-disk reality (diagnostics, guard, skill-mcp) — removed fabricated entries (copilot-auth.ts, sdk/) and the two removed plugins.
- Updated `.opencode/README.md` Plugins section: lists real plugins (diagnostics, guard, skill-mcp) — removed dead names (sessions.ts, compaction.ts, swarm-enforcer.ts, copilot-auth.ts).
- Fixed root `AGENTS.md:15` plugin layout line (dropped session-summary + prompt-leverage).

Verification:
- `rg -n 'experimental\.chat\.(messages|system)\.transform|PromptLeverage|SessionSummaryPlugin' .opencode/plugin` → no matches (clean)
- `bash .opencode/tool/verify.sh` → exit 0 (all checks pass; Bun compile smoke clean — no broken imports)
- No dangling refs to removed plugins outside planning artifacts (which legitimately document the removal).

**Task 3 pending:** needs opencode restart (plugins auto-discover at startup) + forced-compaction continuity test.

## 2026-07-22 — Plan 2 Task 3 complete (restart + continuity check)

- User restarted opencode. Verified plugins unloaded:
  - `prompt-leverage.ts` gone — user prompts arrive unwrapped (no Objective/Context/Work Style framework). Direct evidence: the "I restarted already" message arrived as plain text.
  - `session-summary.ts` gone — no `<session_summary>` block in context.
- Continuity test: file-based memory (state.md + MEMORY.md + progress.md) is complete enough to resume after compaction. Verified all 5 continuity dimensions are captured in state.md:
  1. Intent: "verifier-centered harness for personal use" (Active Decisions)
  2. Modified paths: Plans 1-2 logged (Recent Completed Work)
  3. Constraints: simplify aggressively, .opencode canonical, template/ excluded (Active Decisions)
  4. Verification state: verify.sh green, commit 0b429a7 pushed (Recent Completed Work)
  5. Next step: Plan 3 tasks listed (Next Actions)
- Updated state.md to reflect reality (was stale — still said "Ready to start Plan 2").

Verification: `bash .opencode/tool/verify.sh` → exit 0. Plugins on disk: diagnostics, guard, skill-mcp (3).

**Plan 2 COMPLETE.** Continuity now relies on file-based memory per research (Anthropic/Letta: phase-boundary compaction + file memory, not every-turn injection).

## 2026-07-22 — Plan 3 complete (align direct execution)

- Rewrote `fix.md`: reproduce→localize→patch→verify→evidence loop using `verify.sh` as base gate (dropped guessed `npm run typecheck/lint/test` that don't exist in this repo).
- Aligned `build.md`: sole-writer framing ("You are the sole writer. Do not delegate implementation."), read-only delegation only (explore/scout/review), simplified Quality Loop to one read-only review pass (dropped iterative score loop + `review-state.json`).
- Finalized `build.md` permissions in frontmatter (rm: ask→deny to match top-level safety; added git commit/reset ask) so Plan 4 doesn't touch build.md.
- Marked swarm routing DORMANT: `batch-implement.md` + `development-lifecycle-workflow.md` (top notice), `README.md` workflow list.

Verification:
- `rg -n 'batch-implement|5 parallel|Wave-Based|per-task commit'` in ship/fix/build → no active routing
- `ship.md:25` explicitly disowns `.active` requirement → `/ship` accepts direct requests
- `fix.md` uses `verify.sh`, no guessed npm scripts
- `build.md` sole-writer, no general-implement delegation
- `bash .opencode/tool/verify.sh` → exit 0

## 2026-07-22 — Plan 4 Tasks 1-2 done on disk (Task 3 needs restart)

- **Task 1 (plan.md):** narrowed bash from `"*": allow` to deny-first read-only allowlist (rg, git diff/log/status/show/branch, ls, find, wc, test, file, opencode debug). opencode.json top-level unchanged (already the centralized default).
- **Task 2 (4 specialists):** added `apply_patch: false` + `task: false` to `tools:` blocks; flipped bash from `"*": allow` to deny-first allowlists. For general: added `edit:false, write:false, todowrite:false, question:false` (was implementer, now read-only synthesizer) + updated Purpose line. For scout: kept write/edit artifact allow (research.md writes legit), added apply_patch/task false.
- Files verified on disk: `apply_patch: false` confirmed in general.md:8, scout.md:7, explore.md, review.md.

**Verification (via `opencode debug agent`):**
- `task: false` confirmed for all 4 specialists (general, explore, review, scout) — the critical hard gate.
- `apply_patch` values are STALE (reflect startup config, not disk): explore=false, review=false (had edit:false at startup), general=undefined, scout=true (no tools block at startup). Per customize-opencode skill, config loads once at startup — `opencode debug agent` shows startup state, not disk. After restart, general (`edit:false`) should resolve `apply_patch=false`; scout keeps apply_patch enabled but `edit` permission restricts to artifacts.
- `invalid: true` flag is pre-existing (build also has it, untouched by Plan 4) — not caused by Plan 4 edits.

**Task 3 PENDING:** needs opencode restart for `opencode debug agent` to reflect disk changes. `bash .opencode/tool/verify.sh` → exit 0.
