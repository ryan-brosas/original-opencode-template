# Repo-Boundary Enforcement — Defense-in-Depth

**Slug:** repo-boundary-enforcement
**Created:** 2026-07-22
**Status:** Ready

## Bead Metadata

```yaml
depends_on: [] # standalone; assumes external_directory:deny already shipped (4ce663b)
parallel: false # static check + runtime plugin + tests + closeout, serial
conflicts_with: []
```

## Problem

`external_directory: "deny"` (shipped `4ce663b`) is a **single layer** enforced by opencode before path-taking tools run. The deep-research scout audit (`artifacts/repo-boundary-enforcement-research.md`) read the opencode source and found it is **lexical, not realpath-based** (`FSUtil.contains()` in `packages/core/src/fs-util.ts` is `path.relative()` containment, no `EvalSymlinks`), and the shell scanner (`packages/opencode/src/tool/shell.ts`) only checks a small `FILES` allowlist without modeling cwd or subprocesses. Documented bypass vectors that `deny` does NOT catch:

- `git -C ../sibling status` — git not in the file allowlist
- `ls ../sibling` — ls not in `FILES`
- `python -c 'open("../sibling/x")'` / subprocesses — only the top-level command is recognized
- symlink inside workspace → outside target — lexical check, resolved at FS level not permission time
- a later `allow` rule overriding an earlier `deny` — permission eval is `findLast()` last-match-wins (issue #37935)

Separately, the config value is one edit away from regressing to `"ask"` (the soft wall that enabled the original drift) with no static guard catching the regression.

## Solution

**Option C — static invariant + runtime plugin** (defense-in-depth, the research recommendation):

1. **Static invariant** — a new structural-check.sh check asserting `.opencode/opencode.json` root `permission.external_directory == "deny"`. Prevents config drift back to `ask`/`allow`; runs in `verify.sh`.
2. **Runtime plugin** — `.opencode/plugin/repo-boundary.ts` using the `tool.execute.before` hook (the proven `guard.ts` shape) that re-checks every tool call's path args against `{directory, worktree}` with `..` normalization + symlink resolution, and **throws to abort** on any escape. Closes the bash/symlink/subprocess bypass vectors at runtime, in-session, for every tool call — independent of opencode's `external_directory` and its upstream evolution.

The plugin is the authoritative wall; the static check keeps the config aligned. Even if opencode's `external_directory` is weakened upstream or a new bypass emerges in our pinned `@opencode-ai/plugin@1.18.4`, the plugin still denies escapes.

## Scope

### In scope

- A new `structural-check.sh` check (Check 7/7) asserting `permission.external_directory == "deny"` via `bun -e`/`jq`; exits 1 on any other value or missing field.
- `.opencode/plugin/repo-boundary.ts` (≤300 lines, SDK-only import) implementing `tool.execute.before`: denies path-bearing tools (read/edit/glob/grep) and bash command strings whose resolved path escapes `{directory, worktree}`; returns `{args}` unchanged otherwise.
- `.opencode/plugin/repo-boundary.test.ts` (bun test) proving: in-repo paths pass; `../sibling` escapes throw; symlink-to-outside throws; `git -C ../sibling` / `ls ../sibling` bash strings throw; `cat in-repo-file` passes.
- Docs: AGENTS.md + README.md plugin inventory; MEMORY.md decision; roadmap.md experiment→shipped; state.md closeout.

### Out of scope (explicit non-goals)

- A `permission.ask` plugin hook (redundant under `deny` + locked config — research L5).
- Permission-event observability/logging (research L6 — deferred until an audit reason exists).
- Rewriting or monkey-patching opencode's own `external_directory` implementation.
- Network firewalling, sandboxing beyond path containment, or a separate process jail.
- Modifying upstream opencode or bumping the pinned SDK.
- A general bash AST parser (use token-scan, accept the residual subprocess-in-string-literal bypass).

## Success Criteria

1. **Static invariant exists and fails on regression.** `structural-check.sh` has a Check 7 asserting `permission.external_directory == "deny"`; it exits 1 when the value is `"ask"`/`"allow"`/missing. **Verify:** temporarily set `ask`, run `bash .opencode/tool/structural-check.sh` (expect exit 1), restore `deny`, run again (expect exit 0).
2. **Plugin exists, bounded, SDK-only.** `test -f .opencode/plugin/repo-boundary.ts` and `wc -l` ≤ 300 and `rg -n "from \"@opencode-ai/plugin\""` matches with no other local imports. **Verify:** `wc -l .opencode/plugin/repo-boundary.ts` && `rg -n "^import" .opencode/plugin/repo-boundary.ts`.
3. **Plugin denies escapes, allows in-repo.** `bun .opencode/plugin/repo-boundary.test.ts` passes; tests cover ≥6 cases (in-repo pass, `../` escape throw, symlink-outside throw, `git -C ../` throw, `ls ../` throw, in-repo bash pass). **Verify:** `bun .opencode/plugin/repo-boundary.test.ts` (exit 0).
4. **Plugin does not false-deny legitimate work.** `bash .opencode/tool/verify.sh` exits 0 (the plugin runs live during verify; any false-deny breaks verify). **Verify:** `bash .opencode/tool/verify.sh` (exit 0).
5. **Config cannot silently regress.** With the static check in place, a committed/pushed `external_directory: "ask"` fails `verify.sh` Check 2. **Verify:** (covered by sc1 + sc4 together).
6. **Decision recorded + bead closed.** `rg -n "repo-boundary" .opencode/artifacts/MEMORY.md` matches (decision); `test ! -e .opencode/artifacts/.active` (closed). **Verify:** `rg -n "repo-boundary enforcement" .opencode/artifacts/MEMORY.md` && `test ! -e .opencode/artifacts/.active`.

## Technical Context

- **Enforcement analog (proven shape):** `.opencode/plugin/guard.ts:15-57` — `export const X: Plugin = async () => ({ "tool.execute.before": async (input, output) => { if (input.tool !== "bash") return; const cmd = output.args?.command; ... throw new Error(...) } })`. `input.tool` is the tool name string; `output.args` is the mutable args object; `throw` aborts the call.
- **Plugin ctx (directory/worktree):** `.opencode/plugin/skill-mine-telemetry.ts:41-64` uses `async ({ directory, worktree }) => ({...})` — same ctx available to a `before` hook for containment checks.
- **SDK hook types:** `.opencode/node_modules/@opencode-ai/plugin/dist/index.d.ts:225-258` — `tool.execute.before` input `{tool, sessionID, callID}`, output `{args}` (mutable), throw-to-abort.
- **Tool arg shapes (to verify in Task 2):** `read({filePath})`, `edit({filePath,...})`, `glob({pattern,path})`, `grep({pattern,path,include})`, `bash({command,workdir})` — confirm against the SDK Tool type before writing the dispatcher.
- **Static check host:** `.opencode/tool/structural-check.sh` has 6 checks (plugin isolation, SDK boundary, file sizes, TODO hygiene, kebab filenames, fallow readiness), `exit 1` on failure, `fail()`/`pass()` pattern; add Check 7.
- **Config validation host:** `.opencode/tool/verify.sh:28-39` Check 1 runs `OPENCODE_PURE=1 opencode debug config` + `JSON.parse(opencode.json)` — already validates config JSON; the deny-assertion belongs in structural-check (invariant enforcer), not Check 1 (valid-JSON enforcer).
- **Plugin load:** local plugins in `.opencode/plugin/*.ts` are auto-loaded (diagnostics/guard/skill-mcp/skill-mine-telemetry are NOT in `opencode.json` `plugin[]`, which lists only external npm plugins). New plugin drops into the dir; no registration needed.
- **Research basis:** `.opencode/artifacts/repo-boundary-enforcement-research.md` — scout source audit + 6-layer surface map + Option C rationale.

## Affected Files

- `.opencode/tool/structural-check.sh` (edit) — add Check 7 (external_directory deny assertion).
- `.opencode/plugin/repo-boundary.ts` (new) — runtime `tool.execute.before` containment guard.
- `.opencode/plugin/repo-boundary.test.ts` (new) — bun behavioral tests.
- `AGENTS.md` (edit) — plugin inventory line (add repo-boundary).
- `.opencode/README.md` (edit) — plugin inventory if it lists plugins.
- `.opencode/artifacts/MEMORY.md` (edit) — append decision.
- `.opencode/roadmap.md` (edit) — move experiment note to shipped, or add a shipped entry.
- `.opencode/state.md` (edit) — active plan + completion record.
- `.opencode/artifacts/repo-boundary-enforcement/{spec,prd.json,progress}.md` (new) — this artifact.

## Tasks

### [feature] Task 1 — Static invariant: structural-check Check 7

Add Check 7/7 to `.opencode/tool/structural-check.sh` that asserts `.opencode/opencode.json` root `permission.external_directory == "deny"` (via `bun -e` reading the JSON, or `jq`). Exits 1 on `"ask"`, `"allow"`, missing field, or missing file. Update the check counter (6→7) and the pass/fail echo. No runtime plugin yet.

```yaml
depends_on: []
parallel: false
conflicts_with: []
files:
  - .opencode/tool/structural-check.sh
```

**Verify:** `bash .opencode/tool/structural-check.sh` (exit 0 with deny); temporarily set `external_directory: "ask"`, re-run (expect exit 1), restore `deny`; `bash .opencode/tool/verify.sh` (exit 0).

### [feature] Task 2 — Runtime repo-boundary plugin

Create `.opencode/plugin/repo-boundary.ts` (≤300 lines, `import type { Plugin } from "@opencode-ai/plugin"` only) mirroring `guard.ts`'s `tool.execute.before` shape. Get `{directory, worktree}` from plugin ctx. For path-bearing tools (read/edit/glob/grep) and bash (`output.args.command`): extract candidate path tokens, resolve each against `directory` with `path.resolve` + `fs.realpathSync` (symlink resolution), and `throw new Error(...)` if the resolved path is not contained in `directory` or `worktree`. Return `{args}` unchanged for in-repo calls. Verify the exact tool arg shapes against the SDK Tool type before writing the dispatcher.

```yaml
depends_on: ["Task 1"]
parallel: false
conflicts_with: []
files:
  - .opencode/plugin/repo-boundary.ts
```

**Verify:** `wc -l .opencode/plugin/repo-boundary.ts` (≤300) && `rg -n "^import" .opencode/plugin/repo-boundary.ts` (SDK only) && `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` (clean) && `bash .opencode/tool/verify.sh` (exit 0 — plugin loads live without false-deny).

### [test] Task 3 — Plugin behavioral tests

Create `.opencode/plugin/repo-boundary.test.ts` (bun test). Construct the plugin with a temp directory as `directory`/`worktree`, invoke the `tool.execute.before` hook with synthetic args, and assert: (a) in-repo `read`/`edit`/`glob`/`grep` pass (return `{args}`); (b) `../sibling` escape throws; (c) symlink inside temp dir → outside target throws; (d) `git -C ../sibling status` bash string throws; (e) `ls ../sibling` throws; (f) `cat <in-repo-file>` bash string passes. Use a real temp dir + real symlink so realpath resolution is exercised, not mocked.

```yaml
depends_on: ["Task 2"]
parallel: false
conflicts_with: []
files:
  - .opencode/plugin/repo-boundary.test.ts
```

**Verify:** `bun .opencode/plugin/repo-boundary.test.ts` (exit 0, ≥6 test cases).

### [governance] Task 4 — Docs + closeout

Update `AGENTS.md` plugin inventory line (add repo-boundary); update `.opencode/README.md` if it lists plugins. Append the decision to `MEMORY.md` (Option C, what it catches, the residual accepted bypass — subprocess path inside a string literal). Update `roadmap.md` (experiment → shipped) + `state.md` (active plan + completion). Run `bash .opencode/tool/verify.sh` (exit 0) + `bun .opencode/plugin/repo-boundary.test.ts` (exit 0). Commit + push. `git rm .opencode/artifacts/.active` (bead closed).

```yaml
depends_on: ["Task 1", "Task 2", "Task 3"]
parallel: false
conflicts_with: []
files:
  - AGENTS.md
  - .opencode/README.md
  - .opencode/artifacts/MEMORY.md
  - .opencode/roadmap.md
  - .opencode/state.md
  - .opencode/artifacts/repo-boundary-enforcement/spec.md
  - .opencode/artifacts/repo-boundary-enforcement/prd.json
  - .opencode/artifacts/repo-boundary-enforcement/progress.md
  - .opencode/artifacts/.active
```

**Verify:** `bash .opencode/tool/verify.sh` (exit 0) && `bun .opencode/plugin/repo-boundary.test.ts` (exit 0) && `rg -n "repo-boundary enforcement" .opencode/artifacts/MEMORY.md` && `test ! -e .opencode/artifacts/.active`.

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Plugin false-denies legitimate in-repo work (breaks verify.sh) | High | Tests (Task 3) + plugin only denies resolved escapes, allows everything in-repo; sc4 runs verify.sh live as the false-deny gate |
| Bash token-scan is brittle (false positives on `..` inside string literals) | Medium | Token-scan + only treat tokens that resolve to real escaping paths; accept the residual subprocess-in-literal bypass (documented, stop condition) |
| Symlink strictness breaks legit in-workspace symlinks | Medium | Resolve + deny escape (matches "shouldn't drift"); escape hatch = explicit `external_directory` allow rule in opencode.json for the legit external path |
| Plugin exceeds 300-line limit | Low | Token-scan + a single dispatcher; structural-check enforces ≤300 |
| Upstream opencode fixes the bypasses in a future SDK | Low (positive) | Stop condition 3: re-evaluate whether the plugin is still needed; the static check stays regardless |

## Open Questions

| # | Question | Resolution |
|---|---|---|
| 1 | Bash-scan granularity: token-scan (any escaping path token) vs targeted denylist (git -C/ls/subprocess) | Resolve in Task 2: token-scan (simplest, catches all vectors); targeted denylist is brittle (misses new commands) |
| 2 | Symlink policy: resolve + deny escape (strict) vs leave to opencode lexical | Resolve in Task 2: resolve + deny escape, with explicit allow-rule escape hatch (matches "shouldn't drift") |
| 3 | Exact tool arg shapes (read/edit/glob/grep/bash) | Resolve in Task 2: verify against the SDK Tool type / existing plugin usage before writing the dispatcher |
| 4 | Does `.opencode/README.md` list plugins? (Task 4 doc edit) | Resolve in Task 4: grep README for plugin inventory |

## Stop Conditions (delete/never ship the plugin if any hold; keep the static check regardless)

1. The plugin cannot reliably extract path args from bash command strings (token-scan too brittle, false-positive rate unacceptable) → drop the plugin (Task 2/3), keep the static invariant (Task 1).
2. The plugin false-denies legitimate in-repo work after reasonable testing (sc4 fails) → drop the plugin, keep the static check; document the negative result.
3. opencode upstream fixes the bypass vectors and pins the fix in our `@opencode-ai/plugin@1.18.4` → re-evaluate whether the runtime plugin is still needed; the static invariant stays as a config-regression guard regardless.

## Notes

The static invariant (Task 1) ships even if the plugin is dropped — it guards config regression, which is a separate failure mode from runtime bypass. The plugin (Task 2) is the layer that closes the scout-found bypass vectors; the static check is the layer that prevents the config silently weakening. They defend different failure modes; both ship under Option C.
