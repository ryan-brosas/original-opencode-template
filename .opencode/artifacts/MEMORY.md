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
