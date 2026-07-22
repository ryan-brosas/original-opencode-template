# Repo-Boundary Enforcement — Progress

**Slug:** repo-boundary-enforcement

## Shipped slices

### 2026-07-22 — Static invariant (Plan 02 Task 1) — SHIPPED

## Shipped: structural-check Check 7 locks external_directory=deny (defense-in-depth)
Changed: .opencode/tool/structural-check.sh:124-148, .opencode/tool/repo-boundary-invariant-test.sh (new, 176 lines), .opencode/.template-manifest.json (regenerated), .opencode/command/verify.md:31
Commands: `bash .opencode/tool/verify.sh` (exit 0), `bash .opencode/tool/repo-boundary-invariant-test.sh` (exit 0, 8 cases / 24 assertions)
Result: PASS — all gates green
Commit: 33be136 (pushed f2b9cbd..33be136 main -> main)
Risks: static-invariant layer only; locks the already-shipped deny (4ce663b) against config regression. Does NOT provide runtime containment — `external_directory: deny` still has documented bypasses (git -C, ls, subprocesses, symlinks). The bubblewrap launcher (Plan 01 Task 2) is the actual runtime boundary; this is the config-drift lock.

Review: 1 read-only `review` subagent run (security-adjacent). 4 findings, all fixed inline + re-verified green:
- P2 lossy comparison (conf 1.0): `String(["deny"])`=`"deny"` would pass an array — fixed by moving `=== "deny"` inside `bun -e` (exit 0/1); proven by the new `["deny"]` case (fails).
- P3 test gaps (conf 1.0): added malformed-JSON, array, bun-error cases + no-PASS assertion on missing-file.
- P3 subshell cleanup (conf 1.0): `fx=$(build_fixture …)` ran in a subshell → `FX_N` never incremented → every fixture collided into one dir (Case 5 inherited Case 4's config). Fixed with a single `TMPROOT` + global `LAST_FX` → zero new temp leaks.
- P2 stale manifest (conf 0.98): regenerated via `sync-template.sh` — hash fresh, new test included.

### 2026-07-22 — Contract reconciliation (Plan 01 Task 1) — SHIPPED

## Shipped: reconcile spec/prd/research to supersede the rejected command-scanner; rewrite around the bubblewrap launcher
Changed: .opencode/artifacts/repo-boundary-enforcement/spec.md (full rewrite), prd.json (full rewrite), .opencode/artifacts/repo-boundary-enforcement-research.md (Addendum appended), .opencode/artifacts/repo-boundary-enforcement/plan.md (new), .opencode/artifacts/repo-boundary-enforcement/progress.md (new)
Commands: `bash .opencode/tool/verify.sh` (exit 0), content assertions (rejected claims gone / bubblewrap present / 33be136 cited / prd.json valid JSON)
Result: PASS — base gate green + content assertions green
Risks: docs/contract only — no runtime change. The active spec no longer claims a command-string scanner is authoritative; the bubblewrap launcher is now the documented boundary. This unblocks Plan 01 Task 2 (launcher TDD) which is the actual runtime containment.

## Open work

- **Plan 01 Task 2** — Launcher TDD: `opencode-sandbox-test.sh` RED → `opencode-sandbox.sh` GREEN. The largest remaining unit; the actual runtime containment. Hard gates confirmed (bwrap 0.9.0, opencode binary, normal git checkout).
- **Plan 01 Task 3** — Liveness-guard TDD: `repo-boundary.test.ts` RED → `repo-boundary.ts` GREEN.
- **Plan 02 Task 1 (remainder)** — wire the launcher + real-bwrap integration into `verify.sh` (missing bwrap = hard FAIL).
- **Plan 02 Task 2** — package without exporting state (`.gitignore` + `sync-template.sh` exclusion + manifest).
- **Plan 02 Task 3** — manual activation + evidence closeout (USER checkpoint: install wrapper outside workspace, restart, `opencode-sandbox-test.sh --active`, then record + remove `.active`).
