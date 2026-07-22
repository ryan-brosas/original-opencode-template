# Repo-Boundary Enforcement — Deep Research

**Slug:** repo-boundary-enforcement
**Created:** 2026-07-22
**Status:** Research complete; Option C superseded by Addendum (bubblewrap sandbox chosen)
**Addendum:** 2026-07-22 — the Option C recommendation below (plugin as authoritative wall) is WRONG; see the Addendum at the end of this file.
**Researchers:** self (grounding + synthesis), scout subagent (opencode source/issues)
**Trigger:** `external_directory: "ask"→"deny"` shipped (`4ce663b`) after the repo-index proof gate drifted into sibling repos. User wants defense-in-depth so it can't happen again — "do a deep research how we can enforce this."

## Problem

`external_directory: deny` is a **single layer** enforced by opencode before path-taking tools run. Scout source audit found it is **lexical, not realpath-based**, and has documented bypass vectors. A single config value is one edit away from being weakened back to `ask`, and several bash patterns slip past it entirely. We need layered enforcement: a runtime guard for what the config misses, and a static invariant so the config can't silently regress.

## Findings (scout, opencode source + issues)

### How opencode decides "outside the working directory"

`external_directory` is enforced via `containsPath(full, ins)` → `FSUtil.contains()` in `packages/core/src/fs-util.ts`, which is **`path.relative()`-based containment (lexical)**. `..` is normalized; **symlinks are NOT resolved first** (`EvalSymlinks` is not called). Boundary is checked against `ctx.directory` and `ctx.worktree` (the OpenCode instance dirs), not raw process cwd.
**Source:** `packages/opencode/src/tool/external-directory.ts`, `packages/opencode/src/project/instance-context.ts`, `packages/core/src/fs-util.ts` (`contains`/`normalizePath`/`resolve`). **Confidence: high.**

### Bypass vectors that `deny` does NOT catch

Shell scanning (`packages/opencode/src/tool/shell.ts`: `parts`/`pathArgs`/`argPath`/`collect`/`FILES`/`CWD`/`ask`) parses bash ASTs, extracts arg tokens, and only checks commands in a small `FILES` allowlist (`cat`, `read`, etc.). It does **not** model cwd changes or inspect subprocesses.

| Vector | Caught by `deny`? | Why |
|---|---|---|
| `cat ../sibling/file` | YES | `cat` ∈ `FILES`, arg path-checked |
| `cd ../sibling && cat x` | PARTIAL | `cd` is scanned, but `cat x` then re-evaluated against original cwd — no stateful cwd tracking |
| `git -C ../sibling status` | **NO** | `git` not in file-touching allowlist → only shell permission considered |
| `ls ../sibling` | **NO** | `ls` not in `FILES` |
| `python -c 'open("../sibling/x")'` / subprocess / helper binary | **NO** | only top-level command recognized |
| symlink inside workspace → outside target | **NO** | lexical check; symlink resolved at FS level, not at permission time |
| later `allow` rule overriding earlier `deny` | **NO** | permission eval is `findLast()` last-match-wins (issue #37935) |

**Confidence: high** for git/ls/subprocess/symlink; **medium** for the `cd` nuance.

### Known bugs/issues
- **#37935** permission eval is last-match-wins (`findLast()`), no specificity logic — a later allow overrides an earlier deny.
- **#38180 / #38161** symlink policy: V1 intentionally keeps lexical authorization for in-project symlink paths (does NOT request `external_directory` for symlinked mutations).
- **#37839 / #37689** relative external paths previously failed before permission eval; fixed in v2/dev.
- **#31767** older V2 glob/grep lacked path-traversal checks (separate stack, now fixed).
**Confidence: medium-high.**

### Other harnesses (comparison)
Claude Code: layered — read-only default, per-action approval, working-directory boundary, optional sandboxed bash, allowlists + hooks. Aider: repo/git-centric, no documented per-command sandbox. Cursor: docs not verifiable from fetched sources.
**Confidence: medium.**

## Enforcement surface available to us

| Layer | Mechanism | Status | Catches |
|---|---|---|---|
| L1 Config | `external_directory: "deny"` in `opencode.json` | **DONE** (`4ce663b`) | direct path args to read/edit/glob/grep + `cat`-class bash |
| L2 Runtime plugin | `tool.execute.before` hook (`{tool, sessionID, callID}`, mutable `args`, throw-to-abort) with `{directory, worktree}` ctx | buildable | any tool call — can re-check args, normalize `..`, resolve symlinks, deny path-bearing bash substrings |
| L3 Static invariant | verify.sh Check 1 or structural-check.sh asserts `permission.external_directory == "deny"` | buildable | config drift back to `ask`/`allow` |
| L4 Convention | AGENTS.md Boundary row | **DONE** (`4ce663b`) | none (documentation) |
| L5 ask-override | `permission.ask` plugin force-deny | redundant under deny+lock | nothing extra — fires only on ask-path |
| L6 Observability | `permission.asked`/`replied` events | optional | drift detection (post-hoc) |

**SDK hook facts** (`.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:225-258`): `tool.execute.before` returns `{args}` (MUTABLE) and can `throw` to abort the call (proven by the `.env`-protection example in the plugins doc). Our existing `tool.execute.after` pattern (`plugin/skill-mine-telemetry.ts:41-64`) takes `({directory, worktree})` — same ctx available to a `before` hook.

## Design space

### Option A — Static invariant only (minimal)
Add a verify/structural check asserting `external_directory == "deny"`. No runtime plugin.
- **Catches:** config regression to ask/allow.
- **Misses:** every bash bypass vector (git -C, ls, subprocess, symlinks). Runtime drift still possible within a session.
- **Cost:** ~15 lines bash. Zero runtime risk.
- **Verdict:** necessary but insufficient — leaves the actual bypass vectors open.

### Option B — Runtime `tool.execute.before` plugin only
New `plugin/repo-boundary.ts` (≤300 lines) re-checks every tool call's path args against `directory`/`worktree` with `..` normalization + symlink resolution; throws on escape. No static check.
- **Catches:** the bypass vectors, for every tool call, in-session.
- **Misses:** config regression (a future `ask` re-enables the soft wall; plugin still runs but its deny is the only wall — actually the plugin IS the wall regardless of config, so config regression matters less here).
- **Cost:** ~80-150 lines TS + a plugin load. Runtime cost on every tool call (path arg scan).
- **Risk:** plugin bugs could block legitimate in-repo calls (false deny). Must be tested.

### Option C — Static invariant + Runtime plugin (Recommended, defense-in-depth)
L3 (config can't regress) + L2 (runtime catches what config misses). Belt and suspenders: even if opencode's `external_directory` is weakened upstream or a new bypass emerges, the plugin is the authoritative wall; the static check keeps the config aligned.
- **Catches:** config regression AND runtime bypass vectors.
- **Cost:** ~15 lines bash + ~80-150 lines TS plugin.
- **Risk:** plugin false-deny (mitigated by tests + the plugin only denies escapes, allows everything in-repo). Plugin isolation: must import SDK only (structural-check enforces).

### Option D — Full: A + B + observability (L6)
Option C + log `permission.asked`/`replied` events to a drift journal.
- **Catches:** everything in C + post-hoc drift detection for audits.
- **Cost:** C + ~30 lines for an event logger.
- **Risk:** more moving parts; observability is nice-to-have, not load-bearing.

## Recommendation

**Option C** — static invariant + runtime `tool.execute.before` plugin. It's the minimal set that closes both failure modes the scout found: (1) config drift (static check) and (2) bash/symlink/subprocess bypass (runtime plugin). Option D's observability is deferred until we have a reason to audit; Option A leaves the real holes open; Option B alone risks config regression with no guardrail.

## Open questions for `/create`

1. **Plugin scope of `bash`**: the plugin can see the bash *command string* in `args.command` — should it (a) deny any `..` that escapes `directory` lexically, (b) also deny `git -C <outside>`/`ls <outside>`/subprocess patterns explicitly, or (c) just resolve-and-deny path args generically? (a) is simplest and catches the escapes; (b) is more targeted but a denylist of bash commands is brittle.
2. **Symlink policy**: resolve symlinks and deny if the target escapes (strict, may break legit in-workspace symlinks), or leave symlinks to opencode's lexical check (matches upstream V1 behavior, accepts the symlink bypass)? Recommend: resolve + deny escape, with an explicit allow rule escape hatch.
3. **Where does the static check live**: verify.sh Check 1 (config validation already exists there) or structural-check.sh (architecture invariants)? Recommend: structural-check.sh — it's the invariant enforcer; verify.sh Check 1 is "is the config valid JSON."

## Stop conditions (delete/never ship if any hold)

1. The runtime plugin cannot reliably extract path args from bash command strings (AST is too brittle) — fall back to Option A.
2. The plugin false-denies legitimate in-repo work after reasonable testing — drop the plugin, keep the static check.
3. opencode upstream fixes the bypass vectors and pins the fix in our `@opencode-ai/plugin@1.18.4` — re-evaluate whether the plugin is still needed.

## Sources

- opencode permissions docs: https://opencode.ai/docs/permissions/ (external_directory semantics, defaults)
- opencode agents docs: https://opencode.ai/docs/agents/ (agent permission override, worktree wording)
- opencode plugins docs: https://opencode.ai/docs/plugins/ (tool.execute.before throw-to-abort, permission.ask)
- opencode source: `packages/core/src/fs-util.ts` (contains/normalizePath/resolve), `packages/opencode/src/tool/{external-directory,shell,read,edit,glob,grep}.ts`, `packages/opencode/src/permission/index.ts`, `packages/{core,opencode}/src/permission.ts` (findLast last-match-wins)
- opencode GitHub: issues #37935, #38180, #38161, #37839, #37689, #31767
- SDK types: `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:225-258`
- Our surface: `.opencode/tool/verify.sh:28-39`, `.opencode/tool/structural-check.sh:95-148`, `.opencode/plugin/skill-mine-telemetry.ts:41-64`
- Comparison: Anthropic Claude Code Security docs; Aider README

---

## Addendum (2026-07-22) — Option C plugin-as-wall is WRONG; bubblewrap sandbox chosen

### What was wrong

The original Recommendation (Option C, above) claimed the `tool.execute.before` plugin is "the authoritative wall" that "closes the bash/symlink/subprocess bypass vectors at runtime, in-session, for every tool call." A read-only architecture review (`review` subagent, confidence 0.96–1.0) proved this cannot be authoritative:

1. **Subprocess/computed-path bypass is irreducible for a command-string scanner.** `python -c 'open("../sibling/x")'`, an in-repo script accessing a sibling, `P=../sibling; ls "$P"`, command substitutions, and helper binaries expose no reliable path token to the hook — the hook sees only the top-level command string, not subprocess filesystem operations. The original spec (line 52) even acknowledged this and "accepted the residual subprocess-in-string-literal bypass," which directly contradicts its "authoritative wall" claim.
2. **Coverage gaps.** The proposed dispatcher covered only `read/edit/glob/grep` + bash command text, omitting `write.filePath`, `bash.workdir`, `lsp.filePath`, and paths embedded in `apply_patch.patchText` — so a write/patch through an in-repo symlink retained the exact symlink escape this feature meant to close.
3. **`realpathSync` cannot validate new write targets** (throws on nonexistent paths; lexical fallback misses new files under symlinked dirs).
4. **`{directory, worktree}` is not a defined boundary** — and opencode uses `worktree="/"` for non-git projects, which a union policy would admit as "the whole filesystem."
5. **A plugin hook is not a containment boundary.** `tool.execute.before` mutates `output.args` and returns `void`; it runs sequentially, so a later argument-mutating hook can invalidate an earlier check; and the host may swallow plugin factory errors. It is a policy gate, not an OS jail.

### Corrected decision (user-selected)

Strict **bubblewrap** (rootless Linux mount-namespace sandbox) is the authoritative boundary. The launcher starts opencode + descendants inside an empty mount namespace exposing only an explicit RO runtime substrate + minimal synthetic `/etc` and mounting the active workspace RW; sibling repos/folders are absent from the namespace. Fail-closed: no fallback to raw opencode. The static invariant (`external_directory: "deny"`, shipped `33be136`) stays as defense-in-depth; the startup plugin becomes a **liveness/mislaunch detector** (marker + canonical root), NOT a path scanner.

### Corrected must-have truths

1. Boundary applies only to processes started by the trusted launcher; the marker/plugin are NOT security boundaries.
2. Persistent host writes = workspace only; hard links + nested mounts under the workspace are rejected (write-through to an outside inode is an escape).
3. Host reads = explicit RO runtime substrate + minimal synthetic `/etc`, never the whole host config (wholesale `/etc` leaks files + `/etc/opencode` config override).
4. Network/localhost/inherited stdio/optional SSH-agent remain shared.
5. Provider/git credentials injected are readable by same-UID descendants; secret isolation is a NON-GOAL.
6. RW Git common-dir can affect shared refs/hooks/config/objects/sibling-worktree metadata.
7. Unsupported Linux/bwrap/userns environments FAIL CLOSED; no fallback, no auto-install.

**Trust anchor:** the installed wrapper lives OUTSIDE the writable workspace; the repo copy is only the installable source. V1 scope = **accidental path drift** (a workspace-owned launcher is not durable against malicious repo/model code unless an immutable external wrapper is installed).

### Why bubblewrap over the alternatives

- **bubblewrap** — rootless, user-namespace, mount-namespace; bind only selected paths; siblings simply never mounted. Lowest setup cost for the strongest structural guarantee.
- **Landlock** — kernel file-access denial but not a mount namespace; some syscalls unrestricted. Not chosen.
- **nsjail / firejail** — namespace + bind-mount + seccomp; viable but heavier.
- **Podman/Docker/devcontainer** — viable container alternative (documented as the cross-platform / stronger-secret-isolation fallback).

### What stays from the original research

The scout source audit (lexical `external_directory`, the bypass-vector table, `findLast()` last-match-wins, the SDK hook facts, the 6-layer surface map) is all still accurate and load-bearing. Only the **recommendation** (Option C plugin-as-wall) is superseded. The static invariant (Option A / layer L3) is shipped and retained regardless.

### Sources for the correction

- Architecture review subagent (read-only): local SDK types, opencode 1.18.4 source, pinned docs — findings with file:line + confidence.
- Bubblewrap: `containers/bubblewrap` README (`--bind`/`--ro-bind`/`--unshare-*`/`--share-net`/`--new-session`/`--die-with-parent`/`--clearenv`; caller args define policy).
- This host's hard gates confirmed: `/usr/bin/bwrap` 0.9.0, opencode at `/home/ryan/.local/bin/opencode`, normal git checkout.
