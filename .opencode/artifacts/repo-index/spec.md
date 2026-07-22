# Repo Index — Bounded On-Demand Locator

**Slug:** repo-index
**Created:** 2026-07-22
**Status:** Ready

## Bead Metadata

```yaml
depends_on: [] # standalone; follows completed skill-mine lifecycle
parallel: false # single bounded command + proof gate
conflicts_with: []
```

## Problem

The template has scattered partial maps of its own structure: root `AGENTS.md`
(coarse project map, auto-injected via `instructions: ["AGENTS.md"]`), `.opencode/README.md`
(capability inventory), `.opencode/tech-stack.md` (stack), `.opencode/artifacts/MEMORY.md`
(architecture + decisions), and `.opencode/.template-manifest.json` (exact hashed
shippable inventory). None is a single, current, bounded locator that an agent
can call on demand to find the right files for a task without reading the whole
repo.

A **committed/injected** `repo-index.md` would duplicate these maps, drift from
source, ship a map of *this template* to structurally-different consumer
projects, and add token bloat to every session (the review audit found existing
drift: README says Cloudflare's 257 files don't ship, but the manifest includes
them; plugin README omits `skill-mine-telemetry.ts`). The arXiv evidence (AOCI
2605.02421, role-aware summaries 2607.11046) says summaries are **routing aids**,
not source replacements — source beats summaries 27/45 vs 4/45 for editing
(What Context 2607.09691).

## Solution

A bounded, on-demand **`/repo-index <scope>` command** that returns a current,
source-citing locator map. It runs under the read-only `explore` agent, takes a
task/subsystem/symbol scope, returns at most ~40 lines / 1,500 tokens, and always
cites `path:line`. It is explicitly a **locator only** — the edit protocol still
requires fresh source before editing. It is NOT a tracked file, NOT added to
`instructions[]`, NOT a verify check, NOT a generator tool with a cache.

The command is an experiment with a **proof gate**: compare total localization
turns and wrong-file starts against the existing `explore`/`zoom-out` baseline on
real tasks. Keep it only if it measurably reduces localization turns without
reducing source reads. Delete it if the stop conditions hold.

## Scope

### In scope

- A `/repo-index` slash command (`.opencode/command/repo-index.md`) bound to the
  `explore` agent, read-only, requiring a `<scope>` argument.
- Bounded output contract: relevant entrypoints, direct modules/callers/import
  edges, exact `path:line` citations, recommended source files to read next,
  explicit omissions/uncertainty, a "locator only; read source before editing"
  note, and a hard ~40-line / ~1,500-token budget.
- A proof-gate protocol: a small set of representative tasks (this template +
  at least one consumer project) measured before/after, with a keep/delete
  decision recorded.

### Out of scope (explicit non-goals)

- A committed/tracked `repo-index.md` file.
- Adding anything to `opencode.json` `instructions[]`.
- A new verify.sh check or structural-check rule.
- A Bun TS generator tool, cache, watcher, database, embeddings, or incremental
  hashing infra.
- Auto-injection of any index into the system prompt.
- Behavioral summaries that replace source for edits.
- Multi-language parser/tree-sitter dependency.

## Success Criteria

1. **Command exists and is bounded.** `test -f .opencode/command/repo-index.md`
   and `rg -n "agent: explore" .opencode/command/repo-index.md` matches; the
   command body enforces a scope argument and states a ~40-line / ~1,500-token
   budget. **Verify:** `rg -n "scope|40|1,500|locator" .opencode/command/repo-index.md`
2. **Read-only + source-citing.** The command runs under `explore` (read-only)
   and every cited file is a real `path:line` in the repo. **Verify:**
   `rg -n "agent: explore" .opencode/command/repo-index.md` and run the command
   on a scope and confirm each citation resolves.
3. **No tracked index file, no injection, no verify change.** No `repo-index.md`
   exists under `.opencode/`; `instructions[]` is unchanged; `verify.sh` is
   unchanged. **Verify:** `test ! -e .opencode/repo-index.md` and
   `rg -n "instructions" .opencode/opencode.json` is unchanged and
   `git diff .opencode/tool/verify.sh` is empty.
4. **Proof gate runs.** A recorded comparison of localization turns vs the
   `explore`/`zoom-out` baseline on at least 3 real tasks (this template + 1
   consumer) exists in `progress.md`. **Verify:** `rg -n "proof gate|baseline|localization" .opencode/artifacts/repo-index/progress.md`
5. **Keep/delete decision recorded.** `progress.md` records whether the
   command measurably reduced localization turns and the final keep/delete
   decision with evidence. **Verify:** `rg -n "keep|delete|decision" .opencode/artifacts/repo-index/progress.md`
6. **No drift introduced.** If kept, the command regenerates on each call (no
   committed snapshot); if deleted, no residual files remain. **Verify:**
   `git status --porcelain` shows only the intended changes.

## Technical Context

- **Existing maps (do not duplicate):** root `AGENTS.md` (auto-injected via
  `.opencode/opencode.json:53` `instructions: ["AGENTS.md"]`), `.opencode/README.md`
  (capability inventory), `.opencode/.template-manifest.json` (exact hashed
  shippable inventory), `.opencode/artifacts/MEMORY.md` (architecture/decisions).
- **Existing task-scoped cartography:** `explore` agent (read-only, ≤3 calls per
  symbol — `.opencode/agent/explore.md:81-93`), `zoom-out` skill
  (`.opencode/skill/zoom-out/SKILL.md:3-8`). The command must NOT replace these;
  it orchestrates them with a bounded output contract.
- **Command loader:** `.opencode/command/<name>.md` with frontmatter
  `description` + `agent: explore` + optional `model`; the body is the prompt
  opencode runs (`$ARGUMENTS` = the scope). See `customize-opencode` skill.
- **Read-only enforcement:** `explore` is already deny-first (edit/write/task
  false — Plan 4 of template-harness-v2), so the command cannot write files.
- **arXiv basis:** AOCI (2605.02421) — plain-text per-file index as a routing
  aid, incremental; role-aware summaries (2607.11046) — summaries route, source
  edits; What Context (2607.09691) — source beats summaries for editing; E3
  (2607.13034) — scoped estimate/execute/expand cuts cost 85%.
- **Drift precedent:** README drift found by the review (Cloudflare 257 files,
  missing telemetry plugin) proves a committed snapshot would go stale — on-demand
  generation avoids this entirely.

## Affected Files

- `.opencode/command/repo-index.md` (new) — the bounded locator command.
- `.opencode/agent/explore.md` (read) — confirm read-only + ≤3-calls constraint;
  add a one-line pointer to `/repo-index` only if it helps (optional, surgical).
- `AGENTS.md` (edit) — add `/repo-index` to the command inventory line.
- `.opencode/README.md` (edit) — add `/repo-index` to the commands table.
- `.opencode/artifacts/MEMORY.md` (edit) — append the decision (on-demand locator,
  not a tracked file; proof gate; keep/delete outcome).
- `.opencode/roadmap.md` (edit) — if kept, note the capability; if deleted, note
  the experiment and its outcome.
- `.opencode/state.md` (edit) — active plan + completion record.
- `.opencode/artifacts/repo-index/{spec,prd.json,progress}.md` (new) — this
  artifact.

## Tasks

### [feature] Task 1 — Bounded `/repo-index <scope>` command

Define the `/repo-index` command under the `explore` agent with a scope argument,
a hard ~40-line / ~1,500-token output budget, source-citing (`path:line`)
locator-only output, explicit omissions, and a "read source before editing"
note. No tracked file, no injection, no verify change.

```yaml
depends_on: []
parallel: false
conflicts_with: []
files:
  - .opencode/command/repo-index.md
  - AGENTS.md
  - .opencode/README.md
```

**Verify:** `test -f .opencode/command/repo-index.md` && `rg -n "agent: explore|scope|40|1,500|locator" .opencode/command/repo-index.md` && `test ! -e .opencode/repo-index.md` && `git diff --exit-code .opencode/tool/verify.sh .opencode/opencode.json`

### [eval] Task 2 — Proof gate on real tasks

Run the proof gate: pick ≥3 representative tasks (this template + at least one
consumer project). For each, measure (a) total localization calls with the
existing `explore`/`zoom-out` path, and (b) total localization calls with
`/repo-index <scope>`. Record wrong-file starts. Record the comparison in
`progress.md` with the task, scope, turns-before, turns-after, wrong-file-starts,
and a keep/delete recommendation.

```yaml
depends_on: ["Task 1"]
parallel: false
conflicts_with: []
files:
  - .opencode/artifacts/repo-index/progress.md
```

**Verify:** `rg -n "proof gate|baseline|turns|keep|delete" .opencode/artifacts/repo-index/progress.md`

### [governance] Task 3 — Keep/delete decision + closeout

Apply the stop conditions from the review audit. If `/repo-index` measurably
reduced localization turns without reducing source reads AND helped at least one
consumer project: keep it, document the decision in `MEMORY.md` + `roadmap.md`.
If any stop condition holds: delete the command, document the negative result in
`MEMORY.md` + `roadmap.md` (an honest "we tried, it didn't help" is valuable).
Either way: update `AGENTS.md`/`README.md` to match the final state, mark the
artifact Complete, remove `.active`.

```yaml
depends_on: ["Task 2"]
parallel: false
conflicts_with: []
files:
  - .opencode/command/repo-index.md  # kept or deleted
  - .opencode/artifacts/MEMORY.md
  - .opencode/roadmap.md
  - .opencode/state.md
  - AGENTS.md
  - .opencode/README.md
  - .opencode/artifacts/repo-index/spec.md
  - .opencode/artifacts/repo-index/prd.json
  - .opencode/artifacts/repo-index/plan.md
  - .opencode/artifacts/repo-index/progress.md
  - .opencode/artifacts/.active
```

**Verify:** `bash .opencode/tool/verify.sh` (exit 0) && `rg -n "repo-index" .opencode/artifacts/MEMORY.md` (decision recorded) && `test ! -e .opencode/artifacts/.active` (closed)

## Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Duplicate-with-source: agent reads index then reads source anyway (net negative) | High | Locator-only note; proof gate measures total turns; delete if no net reduction |
| Drift (if a snapshot were committed) | High (if tracked) | On-demand generation only; never commit a snapshot |
| Token bloat (if injected/always-on) | High (if injected) | Not added to `instructions[]`; bounded ~40 lines; on-demand only |
| Consumer mismatch (ships a map of THIS template) | High (if shipped) | No tracked file; command runs against the active repo |
| Maintenance burden grows into a multi-language indexer | Medium | No generator tool/cache/parser in scope; pure command prompt |
| Overlaps `zoom-out` skill | Medium | Proof gate compares against zoom-out; delete if redundant |

## Open Questions

| # | Question | Status |
|---|---|---|
| 1 | What scopes are most useful? (subsystem, symbol, task-type, file-pattern) | Resolve during Task 2 (the proof gate will reveal which scopes the agent actually requests) |
| 2 | What's the proof-gate task set? (which 3+ tasks, which consumer project) | Resolve during Task 2 (user picks representative tasks) |
| 3 | Should `explore.md` get a one-line pointer to `/repo-index`? | Resolve during Task 1 (surgical; only if it reduces discovery friction) |

## Stop Conditions (from review audit)

Delete the command (or never ship it) if any hold:

1. `AGENTS.md` + one targeted search already identifies the work site within the
   existing `explore` budget (≤3 calls/symbol).
2. No repeated wrong-file starts or localization bottleneck has been observed.
3. The output mostly repeats `AGENTS.md`, README, or `.template-manifest.json`.
4. It cannot stay bounded without omitting the information users actually need.
5. It helps only this template and not at least one real consumer project.
6. Agents still repeat the same broad searches after reading it (no net reduction).
7. Correctness requires behavioral summaries instead of source locators.
8. The design requires auto-injection, embeddings, a database, watchers, or a
   committed generated snapshot.
