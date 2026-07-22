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
