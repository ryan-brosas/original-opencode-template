# Repo-Boundary Enforcement — Implementation Plan

**Slug:** repo-boundary-enforcement
**Created:** 2026-07-22 (build mode; reconciles the read-only `/plan` output)
**Status:** Plan 01 Task 1 in progress; Plan 02 Task 1 partial-done (33be136)

## Goal

Run opencode + descendants inside a fail-closed Linux filesystem sandbox that excludes other user projects/folders. Authoritative boundary = bubblewrap empty mount namespace; defense-in-depth = static invariant (`external_directory: "deny"`, shipped) + startup liveness guard. No command-string scanner (rejected).

## Effort

**XL** — the launcher + tests + packaging are multi-session; the closeout has a hard manual user checkpoint (install wrapper outside workspace + restart + activation proof). Shipped incrementally: the static-invariant slice is DONE (`33be136`); the launcher + liveness guard are the next focused ships.

## Plan 01 — Contract reconciliation + runtime launcher + liveness guard

### Task 1 — Reconcile spec/prd/research (governance, this task)

Rewrite `spec.md`/`prd.json`/`research.md` to supersede the rejected command-scanner; bubblewrap = authoritative; static invariant marked DONE (`33be136`); liveness guard = mislaunch detector, not a path scanner. Create `plan.md` + `progress.md`.

```yaml
depends_on: []
parallel: false
files:
  - .opencode/artifacts/repo-boundary-enforcement/spec.md
  - .opencode/artifacts/repo-boundary-enforcement/prd.json
  - .opencode/artifacts/repo-boundary-enforcement/plan.md
  - .opencode/artifacts/repo-boundary-enforcement/progress.md
  - .opencode/artifacts/repo-boundary-enforcement-research.md
```

**Verify:** `rg -n "bubblewrap|fail-closed" .opencode/artifacts/repo-boundary-enforcement/spec.md` && `rg -n "33be136" .opencode/artifacts/repo-boundary-enforcement/spec.md` && `! rg -n "authoritative wall" .opencode/artifacts/repo-boundary-enforcement/spec.md` && `bun -e 'JSON.parse(require("fs").readFileSync(".opencode/artifacts/repo-boundary-enforcement/prd.json"))'` && `bash .opencode/tool/verify.sh` (exit 0 — artifacts don't affect the gate, but confirm no accidental breakage).

### Task 2 — Launcher TDD (feature)

RED: `opencode-sandbox-test.sh` fails (launcher absent). GREEN: `opencode-sandbox.sh` passes.

Launcher contract (from the review):
- Trusted external config: owner-controlled, not group-writable, parsed without `source`/`eval` (`.opencode/tool/opencode-sandbox.conf.example` template).
- `--clearenv` + terminal/locale vars + explicit provider/proxy allowlist (no wholesale host env).
- Root discovery with all `GIT_*` location vars removed; require a normal checkout (`.git` dir == common dir).
- Preflight rejects: broad roots (`/`, `$HOME`, workspace parent), linked worktrees (V1 fail closed), non-git, descendant mountpoints from `/proc/self/mountinfo` under every mutable bind, sockets, FIFOs, devices, regular files with `st_nlink > 1` unless all links proven internal, symlinked `.sandbox-state` components.
- `.opencode/.sandbox-state/{config,cache,data,state}` created under `umask 077`, root mode `0700`.
- Empty namespace: `--unshare-all --share-net --disable-userns --new-session --die-with-parent --clearenv`.
- Mounts: `/proc`, `/dev`, tmpfs `/tmp`/`/run`/sandbox-home; workspace RW at its canonical absolute path (cwd); `/usr` + system runtime RO; synthetic minimal `/etc` (bind resolv.conf/CA bundles/ld.so.cache/localtime; generate passwd/group/hosts/nsswitch.conf; NEVER expose `/etc/opencode`).
- Bind exact configured opencode/bun executable FILES (resolved to real paths), not arbitrary PATH dirs.
- Containment capability probe before launching opencode; host-side unmounted canary for the activation proof.
- Never fall back to raw opencode.

TDD matrix (fake-bwrap argv contract + real bwrap):
- Missing/broken bwrap → nonzero, child never runs.
- Fake-bwrap argv: empty-namespace policy, system RO mounts, workspace RW bind, no host-home/workspace-parent broad bind, marker/root env, cwd/root, arg forwarding.
- Real bwrap: in-workspace read/write + `git status` pass; fixture-sibling `ls`/`git -C` fail; Python direct/computed/subprocess read fail; symlink workspace→fixture-sibling fail; outside write leaves host sentinel unchanged; hardlink/nested-mount/special-file preflight rejects.
- Fixture `temp/workspace` initialized as an INDEPENDENT git repo (else root discovery selects the outer repo + mounts sibling).

```yaml
depends_on: ["Task 1"]
parallel: false
files:
  - .opencode/tool/opencode-sandbox.sh
  - .opencode/tool/opencode-sandbox-test.sh
  - .opencode/tool/opencode-sandbox.conf.example
```

**Verify:** `bash .opencode/tool/opencode-sandbox-test.sh` (exit 0).

### Task 3 — Liveness-guard TDD (feature)

RED: `repo-boundary.test.ts` fails (plugin absent). GREEN: `repo-boundary.ts` passes.

- `.opencode/plugin/repo-boundary.ts` (≤300 lines, SDK-only import): validates the activation marker is present + canonical `directory === expected root` + the normal-checkout worktree doesn't widen. Warns (stderr + best-effort `client.tui.showToast` from a `chat.message` hook) on missing/malformed marker, root mismatch, widened worktree, or unresolvable path; stays silent when the marker matches. `checkLiveness` is private (not exported — opencode auto-discovers named function exports as plugin factories).
- `.opencode/tool/repo-boundary/repo-boundary.test.ts` (below plugin auto-discovery depth; `bun test`): behavior-based with a mock client (no `checkLiveness` import — it's private); non-literal dynamic import so RED is a runtime rejection, not a compile failure.
- Fresh-process test: raw startup continues with a warning (swallow verified); wrapped startup initializes silently.
- If OpenCode swallows plugin factory throws → STOP, do NOT claim fail-closed from the plugin (narrow the guard to a warning or drop it). [RESOLVED: opencode swallows factory throws (verified empirically); guard is WARNING-only, not fail-closed.]

```yaml
depends_on: ["Task 2"]
parallel: false
files:
  - .opencode/plugin/repo-boundary.ts
  - .opencode/tool/repo-boundary/repo-boundary.test.ts
```

**Verify:** `bun test ./.opencode/tool/repo-boundary/repo-boundary.test.ts` (exit 0).

## Plan 02 — Lock invariant + export without state + manual activation closeout

### Task 1 — Static invariants + verification (partial-done, 33be136)

`structural-check.sh` Check 7 asserts `external_directory == "deny"` (DONE). The static boundary invariant is already verified by `verify.sh` Check 2/5 via `structural-check.sh`. The runtime bwrap containment test (`opencode-sandbox-test.sh`) stays **standalone** — it is NOT wired into `verify.sh`, by design: `verify.sh` is a "deterministic offline" runner (no network/cache, fixed-order) and all four existing `*-test.sh` regression scripts are standalone; bwrap is opt-in, Linux-only, and setuid-required, so a bwrap-gated check would either SKIP on most consumer hosts (noise) or hard-FAIL them (breaks all their verification). The runtime sandbox is verified on demand via `opencode-sandbox-test.sh` (45 assertions, real bwrap, proven containment).

**Verify:** `bash .opencode/tool/verify.sh` (exit 0) && `bash .opencode/tool/repo-boundary-invariant-test.sh` (exit 0).
**Status:** Check 7 + invariant test DONE (`33be136`); verify.sh bwrap wiring RESOLVED — not wired by design (user decision, 2026-07-22).

### Task 2 — Package without exporting state (feature)

RED: export assertion fails (`.sandbox-state/` would ship). GREEN: `sync-template.sh` excludes it.

- `.opencode/.gitignore` adds `.sandbox-state/`.
- `sync-template.sh` excludes `.sandbox-state/`; regenerates `.template-manifest.json`.
- Launcher/config/plugin/tests ship; state never ships.
- Docs (README.md, tech-stack.md, AGENTS.md, verify.md, plugin/README.md) explain trusted install / Linux-only / network+secret limits / normal-checkout / sandbox-local provider+git.

**Verify:** `grep -q sandbox-state .opencode/.gitignore` && `bash .opencode/tool/sync-template.sh` && `! grep -q sandbox-state .opencode/.template-manifest.json` && `bash .opencode/tool/verify.sh` (exit 0).

### Task 3 — Manual activation + evidence-based closeout (governance, USER checkpoint)

- Commit the release candidate.
- USER manually installs the trusted wrapper OUTSIDE the workspace:
  `install -Dm0555 .opencode/tool/opencode-sandbox.sh ~/.local/bin/opencode-sandbox`
  `install -Dm0600 .opencode/tool/opencode-sandbox.conf.example ~/.config/opencode-sandbox/config`
- User configures executable paths + provider-allowlist + sandbox-local git identity.
- User quits + restarts opencode via the wrapper.
- In a fresh wrapped session: run `opencode-sandbox-test.sh --active` + `verify.sh` (exit 0).
- ONLY then: record evidence in MEMORY.md/roadmap.md/state.md, `git rm .opencode/artifacts/.active`, commit closeout.

**Verify:** `opencode-sandbox-test.sh --active` (exit 0, in fresh wrapped session) && `rg -n "repo-boundary enforcement" .opencode/artifacts/MEMORY.md` && `test ! -e .opencode/artifacts/.active`.
**Note:** hard manual checkpoint — cannot complete autonomously.

## Dependency waves

1. Plan 01 Task 1 (reconcile) → Plan 01 Task 2 (launcher) → Plan 01 Task 3 (liveness guard)
2. Plan 02 Task 1 (invariant — DONE; verify.sh wiring resolved as not-wired-by-design) ‖ Plan 01
3. Plan 02 Task 2 (packaging) ← Plan 01 Tasks 2-3
4. Plan 02 Task 3 (activation closeout) ← Plan 02 Task 2

## Compliance audit

- **No prohibited staging:** stage only the listed affected files per task; never `git add .`/`-A`; never stage `template/` (untracked reference copy).
- **No destructive ops without asking:** no `reset --hard`/`checkout .`/`clean -fd`; `git rm .active` only at the final closeout after evidence.
- **Multi-file governance batch flagged:** this reconciliation (Plan 01 Task 1) edits 5 artifact files in one ship — that's the contract reconciliation itself, not unrelated changes; each file traces to "supersede the rejected scanner."
- **Edit protocol:** read fresh before each edit; `write` for full rewrites (spec/prd/plan/progress) after reading; `edit` for surgical changes (research addendum).
- **Verification:** base gate (`verify.sh` exit 0) + task-specific content assertions + (for code tasks) the real test command.

## Next command

`/ship` (Plan 01 Task 2 — launcher TDD) after this reconciliation ships. The launcher is the largest remaining unit; ship it as one focused TDD loop (test RED → launcher GREEN → verify).
