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

### 2026-07-22 — Launcher TDD (Plan 01 Task 2) — SHIPPED

## Shipped: fail-closed bubblewrap launcher + test + conf.example; real-bwrap containment proven
Changed: .opencode/tool/opencode-sandbox.sh (new, 188 lines), .opencode/tool/opencode-sandbox-test.sh (new, 248 lines), .opencode/tool/opencode-sandbox.conf.example (new, 26 lines), .opencode/.template-manifest.json (regenerated)
Commands: `bash .opencode/tool/opencode-sandbox-test.sh` (exit 0, 45 assertions, 0 skipped), `bash .opencode/tool/verify.sh` (exit 0)
Result: PASS — all gates green
Risks:
  - **Containment PROVEN by real bwrap**: R1 workspace-RW, R2 fixture sibling invisible (no broad mount), R3 /usr read-only, R4 external child (outside workspace) execs via the child-bind fix. Child runs as the calling (non-root) user via `--unshare-user`.
  - **Manual checkpoint completed**: user ran `sudo chmod u+s /usr/bin/bwrap` (setuid). bwrap is `-rwsr-xr-x`. Without setuid, bwrap cannot create namespaces on this host (AppArmor/dumpable gate — no unprivileged workaround; see `(b11)`).
  - **`--disable-userns` intentionally omitted**: bwrap reads `/proc/sys/user/max_user_namespaces` to validate it, AppArmor denies that read to setuid-root bwrap. `--disable-userns` only guards NESTED userns escape (a malicious-actor vector, out of V1). `--unshare-user` (kept) drops the child to non-root (proven uid=1000) — the V1 security property holds.
  - **V2 hardening DEFERRED** (malicious-repo/model vectors, out of V1 accidental-drift scope): hard links (st_nlink>1), sockets/FIFOs/devices in the recursive workspace bind (network intentionally shared), descendant bind/FUSE mounts (mountinfo scan), real-bwrap containment as a hard test gate (test SKIPS for portability; launcher always fails closed).

Security review (read-only `review` subagent) found 1 functional blocker + several V1-accidental gaps + several malicious-vector findings. Applied all V1-essential fixes inline and re-verified green:
  - **P1 child not mounted (functional)** — the real opencode at `~/.local/bin/opencode` lives under `$HOME` (never mounted), so bwrap failed at exec; the test had masked this by placing the probe inside the workspace. Fix: `--ro-bind` the resolved child into the namespace when it lives outside the mounted RO roots. Proven by new R4 (external child execs). NOTE: the opencode wrapper execs `$HOME/.opencode/bin/opencode` (real binary + 1.8GB db under `$HOME`) — full opencode activation (sandbox-local auth/identity/data) is Plan 02 Task 2/3 (manual checkpoint), not a Task 2 launcher bug; the launcher correctly execs the configured child in a contained namespace.
  - P1 lexical `$HOME` — canonicalized HOME for the broad-root check (catches symlinked home + rejects empty/unset).
  - P2 `GIT_*` env bypass — git discovery now runs with location GIT_* env stripped; symlinked `.git` rejected.
  - P2 `/opt` removed (leaked non-runtime user data; opencode/bun don't need it).
  - P3 probe exit-code reporting fixed (`if !` reported `!`'s status).
  - P1 `ENV_ALLOW` var-name validation before indirect expansion.
  - P2 config integrity — reject symlinked + group/other-writable config (trust-anchor hygiene for bwrap_bin selection).
  - P1 state_dir `..`/absolute escape rejected.
  - Test: added sentinel ("child never ran") checks to all preflight cases, P9 (`..` state_dir), R4 (external child), `--ro-bind / /` contract assertion.

## Open work

- **Plan 01 Task 3** — Liveness-guard TDD: `repo-boundary.test.ts` RED → `repo-boundary.ts` GREEN (startup plugin proves marker + canonical root; NOT a security boundary).
- **Plan 02 Task 1 (remainder)** — wire the launcher + real-bwrap integration into `verify.sh` (missing bwrap = hard FAIL).
- **Plan 02 Task 2** — package without exporting state (`.gitignore` + `sync-template.sh` exclusion + manifest) + sandbox-local opencode/auth/git-identity activation design.
- **Plan 02 Task 3** — manual activation + evidence closeout (USER checkpoint: install wrapper outside workspace, restart, `opencode-sandbox-test.sh --active`, then record + remove `.active`).
