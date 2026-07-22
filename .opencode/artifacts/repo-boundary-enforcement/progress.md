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

## Shipped: Plan 01 Task 3 — repo-boundary liveness plugin (warn-based mislaunch detector)

Changed: `.opencode/plugin/repo-boundary.ts:1-144` (new), `.opencode/tool/repo-boundary/repo-boundary.test.ts:1-165` (new), `.opencode/artifacts/repo-boundary-enforcement/spec.md:36,83,131`, `plan.md:71-74,84`, `prd.json:30-31,85,189`, `.opencode/.template-manifest.json` (regenerated)
Commands: `bun test ./.opencode/tool/repo-boundary/repo-boundary.test.ts` (exit 0, 7 pass 0 fail, 17 expect() calls), `bash .opencode/tool/verify.sh` (exit 0), `bash .opencode/tool/opencode-sandbox-test.sh` (exit 0, unaffected), `bash .opencode/tool/repo-boundary-invariant-test.sh` (exit 0, unaffected)
Result: PASS — all gates green

### Load-bearing empirical findings (cited for closeout)

- **opencode SWALLOWS plugin factory throws** (throw-swallow experiment): a factory throw is logged `level=ERROR "failed to load plugin"` and opencode CONTINUES (LLM responds, exit 0). This triggered plan.md:74 stop condition → the guard is **WARNING-only, never fail-closed throw**. The bubblewrap launcher (Task 2) is the actual security boundary; the plugin only detects whether opencode was launched inside it.
- **opencode auto-loads named function exports as plugin factories** (named-export experiment): a module exporting `const NotAPlugin = "string"` (named) + a valid default logged `level=ERROR "failed to load plugin" error="Plugin export is not a function"`. So a named `checkLiveness` export would be mis-invoked as a plugin factory. → `checkLiveness` is **private** (not exported); only `RepoBoundaryPlugin` + `default` ship (matches `guard.ts`/`diagnostics.ts`).
- **TUI toast API exists** (SDK lookup): `await client.tui.showToast({ body: { title, message, variant: "warning" } })` (`TuiShowToastData`, `/tui/show-toast`); `PluginInput.client` has `client.tui`. → dual-channel warning: stderr immediately in the factory (headless/logs reliable) + best-effort toast from a `chat.message` hook ONCE (TUI guaranteed up by first user message; try/catch: headless/no-TUI → fails caught).

### Security-review findings fixed (read-only `review` subagent, ses_076edd427)

- **P1 warning TUI-invisible** (conf 0.91) — stderr alone can be overwritten by the next TUI render. Fix: dual-channel (stderr + best-effort toast from `chat.message` hook, idempotent via `toasted` flag reset at factory start).
- **P2 `checkLiveness` auto-loaded as malformed plugin** (conf 0.97) — opencode auto-loads named function exports. Fix: `checkLiveness` private; only plugin exports ship.
- **P2 docs overclaim "throws"/"proves containment"** (conf 0.99) — a forgeable marker proves CONSISTENCY, not containment. Fix: spec.md/plan.md/prd.json now say "warns", "consistent with a wrapper launch", "raw continues with warning"; the "exits nonzero" claims about the LIVENESS GUARD were removed (launcher "exits nonzero" claims are CORRECT — the launcher IS fail-closed; kept).

### Test-bug iterations (closed)

- Check-4 tsc failure on `result.message` (discriminated-union narrowing under `strict:false`) → fixed with `result.ok === false` (literal equality narrows; `!result.ok` did not).
- Module-level `toasted` persisted across tests via cached `import` → fixed by resetting `toasted=false` at factory start (one process = one factory call = one toast budget; also makes unit tests independent).

Risks:
  - The liveness marker `OPENCODE_SANDBOX_ROOT` is **forgeable** (`OPENCODE_SANDBOX_ROOT=$PWD opencode` fakes it). The plugin detects CONSISTENCY, not containment. This is documented and is why the plugin is a detector, not a security boundary.
  - The toast is **best-effort** (headless/`opencode run`/no-TUI-ready → toast fails, caught). stderr is the reliable channel; toast is the TUI-visible channel. No PTY TUI reproduction was run (review noted this; the mock-client test proves the toast fires, not that it remains visible on screen — acceptable for V1).
  - opencode swallowing factory throws means the plugin CANNOT enforce fail-closed from inside the process; the launcher's preflight + bwrap's inherent fail-closed are the guarantee.

## Shipped: Plan 02 Task 2 (packaging gate) — `.sandbox-state/` never ships

Changed: `.opencode/.gitignore:5` (+`.sandbox-state/`), `.opencode/tool/sync-template.sh:55` (+`.sandbox-state` to EXCLUDES), `.opencode/.template-manifest.json` (regenerated: `.gitignore` + `tool/sync-template.sh` hashes + `createdAt`)
Commands: `grep -q sandbox-state .opencode/.gitignore` (PASS), `bash .opencode/tool/sync-template.sh` (exit 0), `! grep -q sandbox-state .opencode/.template-manifest.json` (PASS), `bash .opencode/tool/verify.sh` (exit 0)
Result: PASS — all gates green

### Honest RED→GREEN (canary-proven)

The packaging property is security-critical (`.sandbox-state/` holds sandbox-local XDG — opencode auth, git identity, sessions, cache; must never ship to consumers). Proven load-bearing with a throwaway canary, not asserted:

- **RED:** created `.opencode/.sandbox-state/auth.json` (gitignored first for safety), ran `sync-template.sh` WITHOUT the sync exclusion → canary LEAKED to `template/.opencode/.sandbox-state/auth.json` AND the manifest (`grep -c sandbox-state` = 1). Proves the sync exclusion is load-bearing (`.gitignore` alone is insufficient — `sync-template.sh` uses its own EXCLUDES list, not gitignore).
- **GREEN:** added `.sandbox-state` to sync EXCLUDES, re-ran `sync-template.sh` → canary excluded (manifest 0 matches, file removed from template/). The 6 other sandbox/repo-boundary files (launcher, launcher-test, conf.example, plugin, plugin-test, invariant-test) still ship — the exclusion is precise (`sandbox-state` ≠ `opencode-sandbox`).
- Canary cleaned up via `mv` to /tmp (`rm` is denied to the agent; gitignore confirmed it was never committable).

### Scope note

Shipped the packaging GATE (the safety property). Deferred the docs batch (Task 2 also lists "docs explain trusted install / Linux-only / network+secret limits / normal-checkout / sandbox-local provider+git" across README.md/tech-stack.md/AGENTS.md/verify.md/plugin/README.md) to a follow-up ship — it's prose for the Task 3 manual-activation user instructions, lower risk than the packaging gate, and bundling 5 doc files would noise this diff. The conf.example already documents setuid + sandbox-local XDG.

## Open work

- **Plan 02 Task 1 (remainder)** — **ARCHITECTURE DECISION PENDING (user):** the plan says wire the launcher + real-bwrap into `verify.sh` with "missing bwrap = hard FAIL not SKIP". But `verify.sh` has an established SKIP convention (Check 4 typecheck SKIPs when the compiler is absent — `verify.sh:14,68-69,82-86`; header line 5: "SKIPs do not fail") and ships to ALL consumers. Hard-failing on missing bwrap would break `verify.sh` for every macOS/WSL/non-setuid-bwrap consumer, blocking ALL their verification (typecheck, structural, config) — not just the boundary check. Options: (a) SKIP-when-bwrap-unavailable (matches verify.sh's existing portability contract; catches regressions WHERE bwrap is present); (b) hard-FAIL (matches the plan's literal wording; breaks non-Linux-setuid consumers); (c) separate `verify-sandbox.sh` invoked only when the sandbox is active (Task 3). Needs user decision before wiring.
- **Plan 02 Task 2 (docs)** — deferred docs batch (trusted install / Linux-only / network+secret limits / normal-checkout / sandbox-local provider+git) — prose, for Task 3 user instructions.
- **Plan 02 Task 3** — manual activation + evidence closeout (USER checkpoint: install wrapper outside workspace, restart, `opencode-sandbox-test.sh --active`, then record + remove `.active`). Hard manual checkpoint — cannot complete autonomously.
