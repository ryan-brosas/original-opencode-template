# Project Memory

Durable project knowledge. Search with `rg -n "topic" .opencode/artifacts/MEMORY.md`, read with `read`, append with `edit`.

Updated: 2026-07-08

---

## Architecture

### Layers

```text
1. Instructions           AGENTS.md, skills
2. Commands               command/ — slash commands
3. Workflows              workflows/ — multi-agent orchestration
4. Plugins                plugin/ — runtime TypeScript plugins
5. Tools                  tool/ — agent-available tools
6. SDK                    plugin/sdk/ — shared types, interfaces
```

### Dependency Rules

| Layer | Can Import From |
|---|---|
| Instructions | Nothing (markdown, self-contained) |
| Commands | Instructions, Skills |
| Workflows | Commands, Instructions, Skills |
| Plugins | SDK only. Never from other plugins. |
| Tools | SDK, Plugins (via defined tool interfaces) |
| SDK | Nothing external. Must be self-contained types. |

### Principles

- **Plugin isolation** — plugins are independent modules; communicate via SDK interfaces, never by importing each other
- **No circular dependencies** — extract shared concerns to SDK
- **Minimal surface area** — keep SDK interfaces small and stable
- **File boundaries** — plugins ≤300 lines, SDK ≤150 lines, commands ≤500 lines, workflows ≤150 lines

---

## Decisions

### [2026-07-08] Memory System: File-Based Project Context

- **Context:** Replaced automated memory pipeline (observation tool, memory-search, memory.db) with file-based context
- **Decision:** Single `.opencode/artifacts/MEMORY.md` file for all durable project knowledge
- **Rationale:** Simpler than 4 separate files. No database, no auto-injection, no black-box pipeline. Grep-friendly, version-controlled.
- **Consequences:** Agents search with `rg -n`, read with `read`, append with `edit`. No automated capture.

### [2026-07-22] Project initialized — OpenCode template (TypeScript + @opencode-ai/plugin)

- **Context:** `/init --deep` run on a repo that IS the OpenCode template/config (real code = `.opencode/plugin` + `.opencode/tool`).
- **Decision:** Created repo-root `./AGENTS.md` (project tech-stack/structure map; the template behavioral kernel remains at `.opencode/AGENTS.md`) and `.opencode/tech-stack.md` (detected values). Confirmed project interpretation = "the template project itself", not a greenfield app.
- **Rationale:** Existing `.opencode/AGENTS.md` is the behavioral kernel (separate concern); a project-specific map belongs at the repo root per `/init` spec.
- **Consequences:** Verification surface = `structural-check.sh` only (no typecheck/tests out of the box); `typescript` not a dep; `plugin/sdk/` referenced by architecture but not yet on disk.

### [2026-07-22] Planning context established — roadmap + state (Mode 2)

- **Context:** `/init --context` run; vision = improve the OpenCode template itself (`.opencode` ↔ `template/.opencode`).
- **Decision:** Created `.opencode/roadmap.md` (4 phases: Stabilize → Verify → Improve DX → Broaden) + `.opencode/state.md`. Target users = personal use only. Sync between the two copies is NOT a first-class priority (one-time reconciliation only, br-003).
- **Rationale:** Mode 1 `--deep` already mapped architecture onto disk, so parallel explore agents were skipped (Minimalism Gate). Phases ordered foundation-first.
- **Consequences:** First work item is br-001 (decide `plugin/sdk/` fate). Planning docs live in `.opencode/`; `template/.opencode` remains the shippable output artifact.

### [2026-07-22] Roadmap replaced — verifier-centered harness (supersedes maintenance-first)

- **Context:** Deep research (Agentless, AdaMAST, DISC, Anthropic/Letta context-engineering, OpenCode docs) showed linear verifier loop > swarms, structured verification > self-reflection, prompt fidelity > rewriting, phase compaction > every-turn injection. Old maintenance-first roadmap (Stabilize → Verify → DX → Broaden) rejected by user as weak.
- **Decision:** Replace with 4 sequential plans: (1) truthful offline `verify.sh` + linear `/ship`, (2) remove `prompt-leverage` + `session-summary` plugins, (3) align `/fix` + build, disable swarm routing, (4) least-privilege agent permissions. User selected "simplify aggressively." `.opencode/` canonical; `template/.opencode` export deferred.
- **Rationale:** Evidence-backed; uses existing OpenCode primitives (instructions, permissions, hooks, compaction, session export) — no new infra. Personal-use scope; no public onboarding.
- **Consequences:** Executable spec at `.opencode/artifacts/template-harness-v2/plan.md`. `structural-check.sh` exits 1 on failure (docs were stale). `plugin/sdk/`, TypeScript devDep, vector memory, swarm sync all deferred.

### [2026-07-22] Deferred optional items resolved — instructions wiring, template export, plugin/sdk audit

- **Context:** Roadmap complete (Plans 1-4). Four deferred optional items addressed.
- **Decision:** (1) `opencode.json` `instructions: ["AGENTS.md"]` — root `AGENTS.md` (project map) is NOT auto-injected by opencode (only `.opencode/AGENTS.md` loads natively as the project AGENTS.md); wiring injects the map exactly once, no duplication (project-root-relative path, different file from `.opencode/AGENTS.md`). (2) `tool/sync-template.sh` — the deferred export mechanism: regenerates `template/.opencode` from `.opencode`'s shippable subset (594 files), removes stale deletions, regenerates `.template-manifest.json` with fresh SHA-256. Working-state excluded: node_modules, .fallow, .fallowrc.json, .gitignore, package*.json, roadmap.md, state.md, tech-stack.md, artifacts/.active, artifacts/template-harness-v2. (3) README.md dead refs (`/start` `/status` `/resume`) + stale `npm run` Verification Baseline + command count/descriptions fixed; root AGENTS.md command-list + template/ note + stale ship.md gotcha fixed. (4) `plugin/sdk/` audit: the 3 plugins (diagnostics, skill-mcp, guard) have disjoint helper modules + types (`diagnostics/types.ts` vs `skill-mcp/types.ts`); NO shared contract exists → `plugin/sdk/` remains deferred (not speculative).
- **Rationale:** Root AGENTS.md is valuable orientation fresh sessions lacked (verified: my own system prompt carried `.opencode/AGENTS.md` but NOT root AGENTS.md). Export mechanism fixes recurring template drift without hand-editing (respects "don't hand-edit template/" rule). plugin/sdk/ stays deferred per Kernel #2 (no speculative abstractions).
- **Consequences:** Requires opencode restart for `instructions[]` to take effect (verify after restart: root AGENTS.md content should appear in fresh sessions; `.opencode/AGENTS.md` continues to load natively). Reconcile template/ anytime with `bash .opencode/tool/sync-template.sh`. `verify.sh` green; `template/` diff clean (only working-state active-only).

### [2026-07-22] Auto ship on completion — commit + push after verify

- **Context:** User wants commit+push to happen automatically after each completed artifact, not gated behind manual approval each time. Chose scope = "any completed artifact" (build agent judges completion), push frequency = "push every commit" (local/remote stay in sync).
- **Decision:** Build agent (`agent/build.md`) commits + pushes after `bash .opencode/tool/verify.sh` exits 0 on a completed work unit. Stage changed paths only (never `git add .`/`git add -A`), conventional message, push to `origin`. `git commit`/`git push` flipped ask→allow in build.md frontmatter; `--force` denied (added `git push*--force*: deny`); `--no-verify` already denied. `/ship` Close section rewritten — removed "Mark complete?" question + "never automatic" claim; now references the standing rule. `/fix` untouched (standing rule covers it).
- **Rationale:** Reduces friction the user hit repeatedly (manual "commit and push" each artifact). verify.sh is the gate (Kernel #4); subagents stay read-only (can't write/commit). Force-push + hook-bypass still denied for safety.
- **Consequences:** Requires opencode restart for the ask→allow permission change to take effect in enforcement; until then commit/push still prompt (ask). After restart, commit+push flows without prompts on completed+verified work.

### [2026-07-22] Semantic typecheck gate — verify.sh Check 4/5

- **Context:** Roadmap deferred "TypeScript devDep / semantic typecheck while package.json is gitignored." The verifier only had Bun compile smoke (syntax/import resolution), no semantic checking. Supersedes the TS-unavailable state recorded above ([2026-07-08] line 56, [2026-07-22] roadmap-replaced line 70, state.md Technical notes).
- **Decision:** Added `typescript@7.0.2`, `@types/bun@1.3.14`, `@types/node@24.12.2` as exact-pinned devDeps (tracked `.opencode/package.json` + `package-lock.json` — un-gitignored the package files, kept `node_modules`/`bun.lock`/`.fallow/` ignored). `verify.sh` gained a 5th section: TypeScript semantic typecheck = **Check 4/5** (after Bun compile smoke, before `git diff --check`), invoking `"$ROOT/.opencode/node_modules/.bin/tsc" --noEmit -p .opencode/tsconfig.json` directly (never bare/npx — deterministic + offline). Both tsconfigs `types` changed `["node","bun-types"]` → `["node","bun"]` (official `@types/bun`); root keeps `strict:false`, nested `plugin/tsconfig.json` keeps `strict:true`. Removed the hand-rolled `plugin/diagnostics/bun.d.ts` shim (official `@types/bun` owns `Bun.spawn` array-form + `Subprocess.kill`). Fixed 3 baseline errors (`guard.ts:20` unknown→string narrowing; `lang-runners.ts` needed NO change once real Bun types loaded). Consumer-clean: `sync-template.sh` excludes package files, so generated templates have no compiler — `verify.sh` SKIPs Check 4/5 honestly (INFO, not FAIL): package.json present → `npm ci --prefix .opencode` hint; absent → `dev-repo only (no package manifest)`. Regression test `verify-typecheck-test.sh` uses isolated `mktemp -d` fixtures (never mutates the real toolchain). `sync-template.sh` export policy made generic (ship only `artifacts/MEMORY.md`, `artifacts/todo.md`, `artifacts/example/**`; exclude everything else under artifacts/ — no more hardcoded artifact exclusions).
- **Rationale:** Semantic typecheck catches real errors Bun compile smoke misses (unresolved types, invalid property access, arg-arity) — it caught 3 latent bugs on first run. Exact pins match the repo's reproducibility style. Nested binary keeps the gate offline + deterministic (bare/npx can be absent or unpinned). Consumer SKIP avoids shipping a dependency the template deliberately excludes. Isolated-fixture regression test proves the SKIP/PASS/FAIL branches without touching the live compiler.
- **Consequences:** `verify.sh` now has 5 checks (was 4); docs updated (AGENTS.md, verify.md, ship.md, README.md, tech-stack.md). `npx tsc` is still a stub at repo root, but `.opencode/node_modules/.bin/tsc` is the real pinned compiler — `npm ci --prefix .opencode` installs it. Strictness migration (strict:false → true) is an explicit non-goal. `plugin/sdk/` still deferred.

---

## Patterns

### File-Based Context Reads

Before starting work: `rg -n "topic" .opencode/artifacts/MEMORY.md` to find relevant decisions, patterns, gotchas.

### Minimal Delegation

Prefer direct tools over `task()` delegation for surgical fixes. Delegate only for isolation, parallelism, or specialist focus.

### Close the Loop

Every non-trivial phase ends with a 1-3 line summary. If you can't summarize it, you don't understand it.

---

## Gotchas

(none yet — add entries here when you spend time debugging something, so nobody repeats it)
