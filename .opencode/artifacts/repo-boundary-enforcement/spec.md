# Repo-Boundary Enforcement — Fail-Closed Filesystem Sandbox

**Slug:** repo-boundary-enforcement
**Created:** 2026-07-22
**Reconciled:** 2026-07-22 (supersedes the initial Option-C command-scanner design)
**Status:** In progress — Plan 01 (contract + launcher) active; Plan 02 Task 1 (static invariant) DONE

## Bead Metadata

```yaml
depends_on: [] # external_directory:deny shipped (4ce663b); static invariant shipped (33be136)
parallel: false # launcher TDD -> liveness guard -> packaging -> manual activation; serial
conflicts_with: []
```

## Problem

`external_directory: "deny"` (shipped `4ce663b`) is a **single lexical layer** enforced by opencode before path-taking tools run. The deep-research scout audit (`artifacts/repo-boundary-enforcement-research.md`) read the opencode source and found it is **lexical, not realpath-based** (`FSUtil.contains()` in `packages/core/src/fs-util.ts` is `path.relative()` containment, no `EvalSymlinks`), and the shell scanner (`packages/opencode/src/tool/shell.ts`) only checks a small `FILES` allowlist without modeling cwd or subprocesses. Documented bypass vectors that `deny` does NOT catch:

- `git -C ../sibling status` — git not in the file allowlist
- `ls ../sibling` — ls not in `FILES`
- `python -c 'open("../sibling/x")'` / subprocesses / helper binaries — only the top-level command is recognized
- symlink inside workspace → outside target — lexical check, resolved at FS level not permission time
- a later `allow` rule overriding an earlier `deny` — permission eval is `findLast()` last-match-wins (issue #37935)

Separately, the config value was one edit away from regressing to `"ask"` (the soft wall that enabled the original repo-index drift) with no static guard catching the regression. **That regression is now locked** — structural-check Check 7 (`33be136`) asserts `external_directory == "deny"` and fails verify.sh on any other value.

## Solution — corrected design (supersedes the initial spec)

The initial spec proposed a `tool.execute.before` command-string scanner as the "authoritative wall." The architecture review (read-only `review` subagent) proved this **cannot be authoritative**: a plugin that sees only a top-level command string cannot contain subprocesses, computed paths, command substitutions, helper binaries, or eliminate the symlink check/use race. The user selected a **strict bubblewrap sandbox** instead.

**Boundary = process-tree filesystem containment via a fail-closed Linux bubblewrap launcher.**

1. **Authoritative boundary — bubblewrap launcher** (`.opencode/tool/opencode-sandbox.sh`). Starts opencode + descendants inside an empty mount namespace; exposes only an explicit RO runtime substrate + a minimal synthetic `/etc`, and mounts the active workspace RW at its canonical path. Sibling repos and other user folders are **absent from the namespace** (never mounted), so no path-taking tool or subprocess can reach them. Fail-closed: missing/ broken bwrap, disabled user namespaces, unsafe mount path, or launcher error exits nonzero and **never falls back to raw opencode**.
2. **Defense-in-depth — static invariant** (DONE, `33be136`). structural-check Check 7 asserts root `permission.external_directory == "deny"`, preventing config drift back to `ask`/`allow`; runs in verify.sh.
3. **Liveness guard — startup plugin** (`.opencode/plugin/repo-boundary.ts`). Detects whether opencode's `directory`/`worktree` are *consistent with* a wrapper launch (marker present + canonical `directory === expected root`). It is a **mislaunch detector, NOT a security boundary** — a matching (forgeable) marker proves only consistency, not containment; actual containment is the bubblewrap launcher's property. opencode swallows plugin factory throws (empirically verified), so the guard is WARNING-only (stderr + best-effort TUI toast), never fail-closed — per the plan's stop condition (plan.md:74).

The launcher is authoritative; the static check + liveness guard are defense-in-depth. No heuristic command-string scanner ships.

## Scope

### In scope

- `.opencode/tool/opencode-sandbox.sh` — fail-closed bubblewrap launcher (≤300-line guideline; bash).
- `.opencode/tool/opencode-sandbox-test.sh` — isolated launcher contract + real-bwrap containment tests (fake-bwrap argv contract; real bwrap in-workspace RW, sibling invisible, subprocess/symlink/hardlink/nested-mount blocked).
- `.opencode/plugin/repo-boundary.ts` — startup liveness guard (marker + canonical-root check; NOT a path scanner).
- `.opencode/tool/repo-boundary/repo-boundary.test.ts` — bun unit tests for the liveness guard (below plugin auto-discovery depth).
- `.opencode/tool/repo-boundary-invariant-test.sh` — DONE (`33be136`): structural-check Check 7 regression tests.
- `.opencode/.sandbox-state/` — sandbox-local XDG/config/cache/auth state (gitignored, never shipped).
- `.opencode/.gitignore` + `sync-template.sh` exclusions + manifest regeneration so state never ships.
- Docs: AGENTS.md, README.md, tech-stack.md, MEMORY.md, roadmap.md, state.md, verify.md.
- Manual activation checkpoint (user installs the trusted wrapper outside the workspace + restarts).

### Out of scope (explicit non-goals)

- A `tool.execute.before` command-string path scanner (the rejected design — cannot be authoritative; see Research Addendum).
- Network isolation / localhost firewalling — network remains shared (provider API + Git access required).
- Secret isolation — provider/git credentials injected into the sandbox are readable by same-UID descendants; this is a filesystem/process-tree containment feature, not a secret sandbox.
- Malicious-repo / malicious-model-code threat — a launcher stored in the agent-writable workspace is not a durable trust anchor; V1 scopes to **accidental path drift** unless the user installs an immutable external wrapper.
- Linked-worktree support in V1 — fail closed on linked worktrees entirely (normal checkouts only); the `.git` pointer is not trusted.
- Auto-install of bubblewrap — if unavailable, stop and ask the user.
- A `permission.ask` plugin hook or permission-event observability (redundant under deny + locked config).
- Modifying upstream opencode or bumping the pinned SDK.
- Cross-platform support — Linux + bubblewrap only (rootless Podman/container is the documented alternative).

## Corrected must-have truths

1. The boundary applies only to processes started by the trusted launcher; the marker and liveness plugin are **not** security boundaries.
2. Persistent host writes are limited to the workspace; pre-existing hard links and nested mounts under the workspace are rejected (write-through to an outside inode via a hard link is an escape).
3. Host reads are an explicit RO runtime substrate + a minimal synthetic `/etc`, never the whole host config (wholesale `/etc` leaks every user-readable file + `/etc/opencode` which can override project config).
4. Network, localhost, inherited stdio, and optional SSH-agent remain shared capabilities.
5. Provider/Git credentials injected into the sandbox are readable by same-UID descendants; secret isolation is a non-goal.
6. RW Git common-dir access can affect shared refs/hooks/config/objects/sibling-worktree metadata (V1 mounts the normal checkout's `.git` dir == common dir).
7. Unsupported Linux/bwrap/user-namespace environments **fail closed**; no fallback, no auto-install.

**Trust anchor:** the installed wrapper lives OUTSIDE the writable workspace; the repo copy is only the installable source. The agent never installs or modifies the trusted wrapper — that is a user checkpoint.

## Success Criteria

1. **Static invariant DONE** (`33be136`). structural-check Check 7 asserts `external_directory == "deny"`, fails on `ask`/`allow`/missing-field/missing-file/malformed/array/bun-error. **Verify:** `bash .opencode/tool/repo-boundary-invariant-test.sh` (exit 0).
2. **Launcher is fail-closed.** `opencode-sandbox.sh` exits nonzero and runs no opencode child when bwrap is missing/broken, user namespaces are disabled, the mount path is unsafe, or preflight rejects the workspace (broad roots, linked worktrees, non-git, descendant mountpoints, sockets/FIFOs/devices, `st_nlink>1`, symlinked state). **Verify:** `bash .opencode/tool/opencode-sandbox-test.sh` (exit 0).
3. **Launcher contains.** Inside a real bwrap run: in-workspace read/write + `git status` pass; direct `ls`/`git -C` to a fixture sibling fail; Python direct/computed/subprocess read of a fixture sibling fails; a symlink from workspace to a fixture sibling fails; an outside write leaves the host sentinel unchanged. **Verify:** `bash .opencode/tool/opencode-sandbox-test.sh` (real-bwrap section, exit 0).
4. **Liveness guard detects mislaunch.** `repo-boundary.ts` warns (stderr + best-effort TUI toast) on a missing/malformed marker, a `directory !== expected root` mismatch, a widened worktree, or an unresolvable path; stays silent when the marker matches. It never throws (opencode swallows factory throws; warn-not-throw is the stop-condition outcome). **Verify:** `bun test ./.opencode/tool/repo-boundary/repo-boundary.test.ts` (exit 0).
5. **No sandbox state ships.** `.sandbox-state/` is gitignored, excluded by `sync-template.sh`, and absent from `.template-manifest.json`; the launcher + tests + plugin ship. **Verify:** `grep -q sandbox-state .opencode/.gitignore` && `sync-template.sh` run, `! grep -q sandbox-state .opencode/.template-manifest.json`.
6. **Decision recorded + bead closed.** MEMORY.md records the sandbox decision; `.active` removed after the manual-activation closeout. **Verify:** `rg -n "repo-boundary enforcement" .opencode/artifacts/MEMORY.md` && `test ! -e .opencode/artifacts/.active`.

## Technical Context

- **Bubblewrap:** rootless user-namespace mount-namespace sandbox (`/usr/bin/bwrap` 0.9.0 confirmed on this host). Supports `--bind`/`--ro-bind`/`--ro-bind-try`/`--tmpfs`/`--proc`/`--dev`/`--unshare-all`/`--share-net`/`--unshare-user`/`--disable-userns`/`--new-session`/`--die-with-parent`/`--clearenv`/`--chdir`/`--setenv`. The caller's arguments define the security policy (README).
- **Host hard gates (confirmed):** Linux; `/usr/bin/bwrap` 0.9.0; opencode at `/home/ryan/.local/bin/opencode`; bun 1.3.14; normal git checkout (`.git` dir == common dir).
- **Existing enforcement (DONE):** root `permission.external_directory: "deny"` (`4ce663b`); AGENTS.md Boundary row (`4ce663b`); structural-check Check 7 (`33be136`).
- **Plugin hook:** `tool.execute.before` is `Promise<void>`, mutates `output.args` in place, throw-to-abort (`.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:235-241`). NOT used as a path scanner.
- **Test placement:** top-level `.opencode/plugin/*.ts` and `.opencode/tool/*.ts` are auto-loaded at startup — test files MUST sit below discovery depth (`.opencode/tool/repo-boundary/`) and run via `bun test`.
- **Verifier limits:** `verify.sh:29-34` runs config validation with `OPENCODE_PURE=1` (plugins disabled); `verify.sh:54-64` compiles TS but does NOT run tests. `verify.sh` is a "deterministic offline" runner (header line 2) and all four `*-test.sh` regression scripts are standalone — the static boundary invariant is verified by `verify.sh` via `structural-check.sh` Check 7; the runtime bwrap containment test (`opencode-sandbox-test.sh`) is NOT wired into `verify.sh`, by design (bwrap is opt-in/Linux-only/setuid-required; wiring would SKIP on most consumers or hard-FAIL them). Run `opencode-sandbox-test.sh` on demand to verify runtime containment.
- **Isolated test pattern:** `.opencode/tool/verify-typecheck-test.sh` (mktemp fixtures, cleanup trap, copies of real scripts, no real-config mutation); `.opencode/tool/repo-boundary-invariant-test.sh` (DONE) follows it.

## Affected Files

- `.opencode/tool/opencode-sandbox.sh` (new) — fail-closed bubblewrap launcher.
- `.opencode/tool/opencode-sandbox-test.sh` (new) — launcher contract + real-bwrap containment tests.
- `.opencode/tool/opencode-sandbox.conf.example` (new) — user-editable trusted config template.
- `.opencode/plugin/repo-boundary.ts` (new) — startup liveness guard.
- `.opencode/tool/repo-boundary/repo-boundary.test.ts` (new) — liveness guard bun tests.
- `.opencode/.gitignore` (edit) — add `.sandbox-state/`.
- `.opencode/tool/sync-template.sh` (edit) — exclude `.sandbox-state/`; regenerate manifest.
- `.opencode/tool/structural-check.sh` (DONE, `33be136`) — Check 7.
- `.opencode/tool/repo-boundary-invariant-test.sh` (DONE, `33be136`) — Check 7 regression tests.
- `.opencode/tool/verify.sh` (NOT edited, by design) — verify.sh stays deterministic/offline; the static boundary invariant is covered via `structural-check.sh` Check 7; the runtime bwrap test is standalone (`opencode-sandbox-test.sh`).
- `AGENTS.md`, `.opencode/README.md`, `.opencode/tech-stack.md`, `.opencode/command/verify.md` (edit) — document the sandbox.
- `.opencode/artifacts/MEMORY.md`, `.opencode/roadmap.md`, `.opencode/state.md` (edit) — decision + closeout.
- `.opencode/artifacts/repo-boundary-enforcement/{spec.md,prd.json,plan.md,progress.md}` (this artifact set).

## Plans

Split into two serial plans (full task detail in `plan.md`):

- **Plan 01 — Contract + runtime:** Task 1 reconcile spec/prd/research (this task); Task 2 launcher TDD (`opencode-sandbox-test.sh` RED → `opencode-sandbox.sh` GREEN); Task 3 liveness-guard TDD (`repo-boundary.test.ts` RED → `repo-boundary.ts` GREEN).
- **Plan 02 — Lock + export + activate:** Task 1 static invariants + verification (**DONE**, `33be136`); Task 2 package without exporting state (`.gitignore` + `sync-template.sh` + manifest); Task 3 manual activation + evidence-based closeout (user installs wrapper, restarts, runs `opencode-sandbox-test.sh --active` + `verify.sh`, then record evidence + remove `.active`).

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Hard link inside workspace → outside inode (write-through escape) | High | Preflight rejects `st_nlink > 1` unless all links proven internal; negative test |
| Nested bind/FUSE mount under workspace imports external tree | High | Preflight rejects descendant mountpoints from `/proc/self/mountinfo` under every mutable bind; negative test |
| Sockets/FIFOs/devices broker host access | High | Preflight rejects special files; negative test |
| Wholesale `/etc` leaks host files + `/etc/opencode` config override | High | Synthetic minimal `/etc`; bind only resolv.conf/CA/ld.so.cache/localtime; never `/etc/opencode` |
| Empty XDG loses provider auth/git identity/sessions | High | `.sandbox-state/` + `--clearenv` + explicit provider/proxy allowlist; one-time auth/git import or in-sandbox `/connect`; never mount all host XDG |
| Sandbox state ships to consumers | High | `.gitignore` + `sync-template.sh` exclusion + manifest assertion; export test |
| Launcher marker forgeable (`OPENCODE_SANDBOX=1 opencode` unsandboxed) | Medium | Liveness guard is a mislaunch detector only; real containment proven by child-behavior inspection in the wrapper test, not the marker |
| OpenCode loader swallows plugin factory throws | Medium | Fresh-process test showing raw startup continues with a warning + wrapped startup initializes silently (swallow verified empirically); guard is WARNING-only, never fail-closed |
| Fixture git root discovery selects outer repo + mounts sibling | Medium | Initialize fixture `temp/workspace` as an INDEPENDENT git repo |
| TUI breakage under `--new-session` | Medium | Test input/resize/interrupt in the activation checkpoint |
| User lacks bwrap/user namespaces on macOS/WSL | Medium | Linux-only documented; fail closed; alternative = rootless Podman/container |

## Open Questions

| # | Question | Resolution |
|---|---|---|
| 1 | Exact opencode/bun executable paths to bind (not arbitrary PATH dirs) | Resolve in Plan 01 Task 2: resolve the confirmed binaries to exact files |
| 2 | Sandbox-local provider auth + git identity bootstrap (import vs in-sandbox `/connect`) | Resolve in Plan 02 Task 2/3 with the user |
| 3 | Does `git passes` include commit + push (HTTPS origin, no local identity today)? | Resolve in Plan 02 Task 3 (sandbox-local credential/identity design) |
| 4 | `webclaw-mcp` executable closure without binding arbitrary home/PATH dirs | Resolve in Plan 01 Task 2 |

## Stop Conditions (delete/never ship the launcher if any hold; keep the static invariant regardless)

1. Bubblewrap cannot establish a working empty-namespace containment on this host (kernel/userns disabled and unfixable) → keep the static invariant; document; recommend rootless Podman as alternative.
2. The launcher cannot stay fail-closed without a fallback that defeats the purpose → keep the static invariant; document the negative result.
3. The liveness guard cannot prove a thrown factory actually aborts opencode startup → drop the guard (keep launcher + invariant), do NOT claim fail-closed from the plugin.
4. The containment tests cannot be made deterministic in isolated fixtures → keep the static invariant; document.

## Notes

The static invariant (`33be136`) ships and stays regardless of the launcher outcome — it guards config regression, a separate failure mode from runtime bypass. The launcher is the layer that achieves actual containment; the liveness guard is defense-in-depth against mislaunch. The initial spec's command-string scanner was rejected because it could not be authoritative (see Research Addendum) — do not revive it.
