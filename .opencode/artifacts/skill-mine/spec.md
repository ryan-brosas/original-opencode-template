# Skill-Mine — Self-Extending Governed Skill Library

**Slug:** skill-mine
**Created:** 2026-07-22
**Status:** Complete (all 7 plans shipped 2026-07-22)

> **Authoritative execution spec:** `.opencode/artifacts/skill-mine/plan.md`.
> The PRD body below is the original `/create` record and is **superseded** by
> the twelve Required PRD Corrections in `plan.md` where the two conflict.
> Key corrections: (1) tracked `.opencode/skill-mine.json` replaces ignored
> state; (2) Bun TS core, not shell; (3) finalized receipts bound to pushed
> trees; (4) deterministic lint split from hash-bound behavioral approval;
> (5) isolated valid/invalid fixtures replace the `memory` fixture; (6)
> loader validation in a temp project; (7) separate project/template skill
> roots; (8) retire/restore before promotion; (9) promotion does no Git ops;
> (10) catalog counts from `metadata.origin: skill-mine` + byte budgets;
> (11) telemetry is a live-hook spike with manual fallback; (12) root
> `AGENTS.md` for command inventory.

## Problem Statement

The OpenCode template has a solid foundation (verifier, linear ship, least-privilege
agents, semantic typecheck) but no mechanism to get *better* at coding from its own
experience. When a task ships successfully, the knowledge of what worked — the
approach, the commands, the failure-recovery — is captured only in `progress.md`
(working-state, not shipped, not reusable). The next similar task starts from
scratch. The 65 existing skills are all hand-authored; none are mined from the
agent's own successful runs.

Research (arXiv 2026) converged across three independent angles on the same
primitive: a self-extending, governed skill library mined from successful
traces. Key papers: Self-Improving Agents via Accumulated Behavioral Rules
(2607.13091), Tool-Making and Self-Evolving Agents (2607.08010),
CommitDistill (2605.18284, no-embedding retriever, 0.75 hit-rate),
MemoHarness (2607.14159), Ratchet (2605.22148, lifecycle hygiene),
EvoClawBench (2607.09711, gate admission — self-authored skills help some
runtimes, hurt others).

A read-only review audit (5 blockers, 4 medium risks) reshaped the naive
"auto-mine on ship" design into an assisted, gated, phased system. The blockers
and their resolutions are documented in Technical Context below.

## Scope

### In-scope

- A `/skill-mine` command (manual, assisted mining — no autonomous trigger
  exists in the plugin SDK; see Technical Context blocker 1)
- A trace-capture format: sanitized evidence extracted from a commit or session
  range (changed paths, verify commands, exit codes, final status — NO raw user
  messages, NO tool output, NO secrets)
- A quarantine state: candidates live OUTSIDE `.opencode/skill/` until promoted
  (so unvalidated skills are never advertised to the model)
- A `skill-mine-validate` gate: deterministic checks (frontmatter, folder/name,
  uniqueness, provenance, helper syntax) + a behavioral check (RED/GREEN/REFACTOR
  per `writing-skills` — the skill must measurably change agent behavior)
- Atomic promotion: candidate → `.opencode/skill/<name>/` only after the gate
  passes, with sanitized provenance committed (commit SHA, date, judge version,
  evidence summary)
- A catalog budget: cap the number of mined skills surfaced to the model (don't
  bloat the system prompt — the session-summary caution)
- Reuse telemetry: log skill invocations (local, gitignored) to inform retirement
- Manual retirement (`/skill-mine gc`): demote skills with no reuse or failing
  re-validation
- Provenance scope: `project` (default) vs `template` (requires cross-project
  evidence before the skill ships via `sync-template.sh`)

### Out-of-scope (non-goals)

- Autonomous capture triggers (no reliable post-ship hook exists; deferred until
  a completion marker emerges from real usage — see Phase 4)
- Vector/embedding retrieval (CommitDistill proved local file + no-embedding
  retriever sufficient at 0.75 hit-rate; OpenCode's description-based surfacing
  is the retrieval mechanism)
- Training/fine-tuning (all papers confirm the loop works without weight updates)
- `skills.urls` remote publishing (overkill for personal use; local files + git
  suffice)
- Plugin-based capture (the build agent is the sole writer; a plugin can only
  observe/queue, not write skills — see Technical Context blocker 7)
- Automated retirement (manual `/skill-mine gc` from day 1; automation deferred
  to Phase 4, gated on real usage evidence)
- Strictness migration, `plugin/sdk/` (existing deferred items, unchanged)

## Proposed Solution

### 6-stage lifecycle (research-backed, audit-corrected)

```
1. Capture   — /skill-mine <sha|range> → sanitized trace in .skill-mine/traces/ (gitignored)
2. Distill   — /skill-mine distill <trace> → candidate in .skill-mine/candidates/<name>/ (quarantine)
3. Validate  — skill-mine-validate <candidate> → deterministic + behavioral gate
4. Store     — /skill-mine promote <candidate> → atomic move to .opencode/skill/<name>/ + commit
5. Retrieve  — OpenCode's native description-based surfacing (capped by catalog budget)
6. Retire    — /skill-mine gc → demote unused/failing skills back to candidates/ or archive
```

### Directory layout (working-state, gitignored)

```
.opencode/.skill-mine/              # ALL gitignored (working-state, never shipped)
├── traces/                        # sanitized capture records (JSON, one per mined commit)
├── candidates/                    # pre-promotion quarantine (SKILL.md + helpers, NOT loaded)
├── archive/                       # retired skills (demoted from .opencode/skill/)
├── usage.jsonl                    # reuse telemetry (skill invocation log)
└── state.json                     # catalog budget tracking, judge version, scope
```

### Phased delivery (4 phases, one PRD)

The review audit mandated: "Keep all 6 stages in the PRD, but phase delivery."
Minimal quarantine, validation, and manual retirement must exist BEFORE the
first promotion. Only retirement automation waits.

| Phase | Stages | Ships |
|-------|--------|-------|
| 1 — Foundation | quarantine + gate + budget | `.skill-mine/` structure, `skill-mine-validate` tool, catalog budget config |
| 2 — Manual mining | capture + distill | `/skill-mine` + `/skill-mine distill` commands |
| 3 — Promotion + telemetry | store + retrieve | `/skill-mine promote`, reuse telemetry, provenance commit |
| 4 — Governance | retire | `/skill-mine gc` (manual); automated trigger deferred |

## Success Criteria

1. **sc1 — Sanitized capture:** `/skill-mine <sha>` produces a trace with
   changed-paths + verify-commands + exit-codes and NO raw user messages, NO
   tool output, NO secret-shaped strings.
   Verify: `bash .opencode/tool/verify.sh` exit 0; `rg -n "password|secret|token|apiKey|credential" .opencode/.skill-mine/traces/*.json` → no matches; trace JSON has `changed_paths`, `verify_commands`, `exit_codes`, `status` keys.

2. **sc2 — Validate gate rejects invalid candidates:** `skill-mine-validate`
   exits 1 on a deliberately-broken candidate (bad frontmatter / name collision / missing provenance / failed behavioral test) with a specific reason; exits 0 on a known-good skill.
   Verify: `bash .opencode/tool/skill-mine-validate .opencode/.skill-mine/candidates/broken/` → exit 1; `bash .opencode/tool/skill-mine-validate .opencode/skill/memory/` → exit 0.

3. **sc3 — Candidates quarantined (not advertised):** Before promotion, the
   candidate does NOT exist under `.opencode/skill/` and is NOT listed by `opencode debug skill`.
   Verify: `test ! -e .opencode/skill/<candidate-name>`; `opencode debug skill --pure 2>/dev/null | rg <candidate-name>` → no match (requires restart to test loader; document as restart-gated).

4. **sc4 — Atomic gated promotion:** `/skill-mine promote` without a passing
   validate → rejected; after validate passes → skill loads via `opencode debug skill`.
   Verify: promote a broken candidate → exit 1, candidate dir intact; promote a validated candidate → exit 0, candidate dir empty, `.opencode/skill/<name>/SKILL.md` exists with provenance, `bash .opencode/tool/verify.sh` exit 0.

5. **sc5 — Catalog budget enforced:** Surfaced mined skills ≤ configured cap
   (default 10); exceeding the cap → promotion rejected.
   Verify: `rg -n "mined" .opencode/skill/*/SKILL.md | wc -l` ≤ cap; attempt to promote beyond cap → exit 1 with budget message.

6. **sc6 — Raw traces never committed:** `.opencode/.skill-mine/` is gitignored;
   `git status` shows nothing staged from it.
   Verify: `git check-ignore .opencode/.skill-mine/traces/test` → prints the path (ignored); `git status --porcelain .opencode/.skill-mine/` → clean.

7. **sc7 — Sanitized provenance in promoted skills:** The promoted SKILL.md
   `metadata` frontmatter has `source_commit`, `mined_date`, `judge_version`, `scope`, `evidence_summary` and NO raw transcript body.
   Verify: `rg -n "source_commit|mined_date|judge_version|scope" .opencode/skill/<mined>/SKILL.md` → matches; no `<session` / `<user` / raw tool-output blocks in the skill body.

8. **sc8 — verify.sh green throughout:** `bash .opencode/tool/verify.sh` exits 0
   after every phase.
   Verify: `bash .opencode/tool/verify.sh` → exit 0.

## Technical Context

### Research basis (arXiv 2026, 3 parallel scout scans)

| Paper | Result | Transfer |
|-------|--------|----------|
| Self-Improving Agents via Accumulated Behavioral Rules (2607.13091) | Accepted reviews → persistent rules; 0% recurrence across 11 sessions | Make successful traces → durable skills with a self-review gate |
| Tool-Making and Self-Evolving Agents (2607.08010) | Repeated workflows → versioned tools; p50 latency −42%, errors −53% | Auto-promote repeated workflows into first-class skills |
| CommitDistill (2605.18284) | Local git history → typed Facts/Skills/Patterns; no-embedding retriever; 0.75 hit-rate | Local files enough; no vector DB |
| MemoHarness (2607.14159) | Dual-layer experience bank from own executions; gains on shell/code/analysis | Capture traces + distill global patterns |
| Ratchet (2605.22148) | Frozen LLM writes/retrieves/curates/retires own skills; lifecycle > authoring | Retire/curate, don't just append |
| EvoClawBench (2607.09711) | Self-authored skills help some runtimes, hurt others | Gate admission on measured reuse value |
| Who Grades the Grader (2607.12790) | Skills + metrics co-evolve; 88-110% of ground-truth lift | Need an evolving judge, not just evolving skills |
| Self-Evolving Harnesses via Gated Quality-Diversity (2607.13683) | Harness evolves when sealed eval says it helped; +9-15.5pp | The harness itself is the evolvable artifact |

### Review audit: 5 blockers resolved

1. **No autonomous capture trigger exists** (no post-ship hook with success
   result; `session.idle` fires after questions/failed work; `command.executed`
   has no success field). **Resolution:** `/skill-mine` is a manual command
   (assisted mining). Honest framing — not "autonomous self-improvement" but
   "assisted skill mining from successful runs." Automated trigger deferred to
   Phase 4, gated on a completion marker emerging from real usage.

2. **verify.sh doesn't validate candidate skills** (Bun compile scans only
   plugin/tool .ts; tsc excludes skill paths + JS; untracked skill invisible to
   every check; no `skill-validate` command exists). **Resolution:** A dedicated
   `skill-mine-validate` tool checks: frontmatter schema (name valid, description
   present, matches folder), uniqueness (no collision with existing 65 skills),
   provenance present, helper syntax (bun build smoke on JS helpers), `opencode
   debug skill` loads the candidate path, and a behavioral RED/GREEN/REFACTOR
   test per `writing-skills` (the skill must measurably change agent behavior —
   this is the evolving judge).

3. **Admission has no behavioral value test** (a frozen model can generate
   plausible-but-false skills and grade its own prose; load count ≠ value).
   **Resolution:** The `writing-skills` RED/GREEN/REFACTOR pattern IS the judge.
   A candidate skill must: (RED) a subagent WITHOUT the skill fails a pressure
   scenario, (GREEN) the smallest skill that flips the failure, (REFACTOR)
   adversarial prompts hold. Judge version recorded in provenance; revalidate
   active skills when the judge changes.

4. **Raw traces can publish secrets** (public repo + auto-push; read
   restrictions don't sanitize messages/diffs/tool output). **Resolution:** Raw
   traces stay in `.opencode/.skill-mine/traces/` (gitignored, never committed).
   Only sanitized provenance is committed in the promoted skill's frontmatter:
   `source_commit`, `mined_date`, `judge_version`, `scope`, `evidence_summary`
   (a 1-3 sentence summary, NOT raw transcript). Secret-scan before promotion.

5. **Candidates under `.opencode/skill/` collapse candidate and promoted
   states** (skills there are advertised to the model on restart; ambient
   injection is prohibited). **Resolution:** Candidates live in
   `.opencode/.skill-mine/candidates/` (OUTSIDE every discovered skill dir).
   Promotion is an atomic move into `.opencode/skill/<name>/` only after the
   gate passes. No `experimental.chat.*.transform` hooks — native on-demand
   loading of an admitted skill body is the only retrieval.

### Review audit: 4 medium risks mitigated

6. **Retrieval unbounded for descriptions** → catalog budget (cap surfaced mined
   skills, default 10); per-agent skill permissions to hide mining infra from
   read-only agents; exceeding budget = promotion failure.

7. **Plugin writes contradict sole-writer** → the build agent or an explicit
   command owns all candidate + promotion writes. No plugin writes to
   `.opencode/skill/`. (A future plugin may observe/queue capture records, but
   never write skills — Phase 4 deferred feature only.)

8. **Project-local vs template-wide** → provenance `scope` field: `project`
   (default, not shipped via sync) vs `template` (requires cross-project +
   cross-runtime evidence before `sync-template.sh` ships it). Mined skills
   default to project-local quarantine; template promotion is a separate
   governance step.

9. **Full lifecycle ≠ one implementation unit** → 4 delivery phases. Minimal
   quarantine, validation, and manual retirement exist BEFORE the first
   promotion (Phase 1 + Phase 4 manual gc ship before Phase 3 promotion).
   Only retirement automation waits.

### Existing surfaces (from explore agents)

- **Skill loader:** startup-scanned, on-demand for content. Discovers from
  `.opencode/skill/`, `~/.config/opencode/`, `.claude/`, `.agents/`,
  `skills.paths`, `skills.urls`. Injects ONLY name+description into prompt; full
  body loaded via `skill({ name })`. No live reload — restart needed. No
  `hidden` frontmatter; governance via permissions or file deletion.
  (`packages/opencode/src/skill/index.ts`, customize-opencode skill)
- **65 existing skills**, frontmatter: `name` (req), `description` (req),
  optional `version`/`tags`/`dependencies`/`agent_types`/`tools`/`license`/
  `compatibility`/`metadata`. Provenance in body, not frontmatter convention.
- **JS helpers:** same-folder executable Node entrypoints (`{baseDir}/...`),
  e.g. `brave-search/search.js`, `browser-tools/browser-start.js`.
- **`writing-skills` SKILL.md:** the meta-skill — RED/GREEN/REFACTOR with
  subagents, pressure-test before writing, commit+index. This IS the behavioral
  test contract the validate gate must honor.
- **Plugin hooks:** `tool.execute.after` (diagnostics pattern), `event`
  (session.*, file.edited, command.executed, vcs.branch.updated), `command.execute.before`.
  NO post-ship/post-commit/session-end hook with success result.
- **Ship/verify trace:** ship.md Close = verify passed → evidence recorded →
  stage → commit → push. Evidence block = "## Shipped: ... Changed: ... Commands:
  ... Result: PASS ... Risks: ...". verify.sh = stdout text, exit code is the
  machine signal. progress.md = canonical "successful trace" (changed paths +
  verify commands + exit codes + final status). Git can supply SHA + diff but
  NOT verify commands/exit codes — must record before commit.
- **`structural-check.sh`:** does NOT cap skill size (only plugins/SDK/commands).
  Does NOT prevent plugin FS writes to skill/ (skill-mcp/utils.ts already uses
  Node fs). But build agent is sole writer — command/plugin boundary is a
  writer-ownership rule, not a structural invariant.

## Affected Files

### New files
- `.opencode/tool/skill-mine-validate` — the candidate gate (shell script or bun ts; deterministic + behavioral)
- `.opencode/command/skill-mine.md` — the `/skill-mine` command (capture + distill + promote + gc)
- `.opencode/.skill-mine/` — working-state dir (traces/, candidates/, archive/, usage.jsonl, state.json) — gitignored
- `.opencode/.skill-mine/state.json` — catalog budget, judge version, scope defaults
- `.opencode/.skill-mine/candidates/.gitkeep` — quarantine placeholder

### Modified files
- `.opencode/.gitignore` — add `.skill-mine/` (working-state, never shipped)
- `.opencode/tool/sync-template.sh` — add `.skill-mine/` to EXCLUDES (never shipped)
- `.opencode/AGENTS.md` — add `/skill-mine` to command list + skill-mine-validate to Commands table + Skill-Mine section to Conventions/Gotchas
- `.opencode/README.md` — add `/skill-mine` to commands list + skill-mine description
- `.opencode/artifacts/MEMORY.md` — append skill-mine decision
- `.opencode/state.md` — track skill-mine as active plan
- `.opencode/roadmap.md` — add skill-mine as a new capability (post-template-harness-v2)

### NOT modified
- `.opencode/tool/verify.sh` — the skill-mine-validate gate is SEPARATE from verify.sh (verify.sh doesn't scan skills; the gate is task-specific)
- `.opencode/opencode.json` — no config change needed (skills auto-discovered from .opencode/skill/; no skills.paths/urls)
- `.opencode/tool/structural-check.sh` — no skill-size cap added (out of scope; advisory only per writing-skills)

## Tasks

### Phase 1 — Foundation (quarantine + gate + budget)

- **[foundation] Task 1.1: Create quarantine structure + gitignore + sync exclusion**
  Create `.opencode/.skill-mine/{traces,candidates,archive}/` + `state.json` (catalog budget default 10, judge version "v1-writing-skills", scope default "project") + `candidates/.gitkeep`. Add `.skill-mine/` to `.opencode/.gitignore`. Add `.skill-mine/` to `sync-template.sh` EXCLUDES.
  depends_on: [] · parallel: false · conflicts_with: []
  files: `.opencode/.skill-mine/state.json`, `.opencode/.skill-mine/candidates/.gitkeep`, `.opencode/.gitignore`, `.opencode/tool/sync-template.sh`
  Verify: `git check-ignore .opencode/.skill-mine/traces/test` → ignored; `bash .opencode/tool/sync-template.sh && test ! -e template/.opencode/.skill-mine` → exit 0; `bash .opencode/tool/verify.sh` → exit 0

- **[foundation] Task 1.2: Create skill-mine-validate gate**
  Create `.opencode/tool/skill-mine-validate` (shell or bun ts): checks (a) frontmatter: name valid (kebab, ≤64, matches folder), description present; (b) uniqueness: no name collision with existing `.opencode/skill/*/SKILL.md`; (c) provenance: metadata has source_commit + mined_date + judge_version + scope + evidence_summary; (d) helper syntax: if JS helpers exist, `bun build` smoke each; (e) behavioral: run the writing-skills RED/GREEN/REFACTOR harness (subagent WITHOUT skill fails scenario, WITH skill passes — this is a documentation-gated step the command prompts for, not fully automatable). Exits 1 on any failure with a specific reason; 0 on pass.
  depends_on: [1.1] · parallel: false · conflicts_with: []
  files: `.opencode/tool/skill-mine-validate`
  Verify: `bash .opencode/tool/skill-mine-validate .opencode/skill/memory/` → exit 0 (known-good); create a broken candidate (bad name, missing provenance) → `bash .opencode/tool/skill-mine-validate .opencode/.skill-mine/candidates/broken/` → exit 1 with reason; `bash .opencode/tool/verify.sh` → exit 0

### Phase 2 — Manual mining (capture + distill)

- **[mining] Task 2.1: Create /skill-mine command (capture)**
  Create `.opencode/command/skill-mine.md` with a `capture` subcommand: takes a commit SHA or session range, reads `git diff --name-only`, `git log -1 --format=%H%n%s%n%b`, `git show --stat`, and the matching `progress.md` evidence block (if the commit references an active artifact). Produces a sanitized JSON trace in `.opencode/.skill-mine/traces/<sha>.json` with keys: `source_commit`, `mined_date`, `changed_paths`, `verify_commands`, `exit_codes`, `status`, `summary` (1-3 sentences, distilled, NOT raw). Secret-scan the trace before writing (deny if matches). No raw user messages, no tool output, no diffs.
  depends_on: [1.1] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`
  Verify: `/skill-mine capture <recent-sha>` → trace file exists; `rg -n "password|secret|token|apiKey|credential" .opencode/.skill-mine/traces/*.json` → no matches; trace has all 7 keys; `bash .opencode/tool/verify.sh` → exit 0

- **[mining] Task 2.2: Create /skill-mine distill (candidate generation)**
  Add a `distill` subcommand to `.opencode/command/skill-mine.md`: takes a trace file, asks the build agent to propose a candidate skill (name, description, body, optional JS helpers) that would have prevented a failure or accelerated the successful approach. Writes to `.opencode/.skill-mine/candidates/<name>/SKILL.md` + helpers. Provenance metadata in frontmatter. The candidate is NOT loaded by OpenCode (quarantine).
  depends_on: [2.1] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`
  Verify: `/skill-mine distill <trace>` → candidate exists with valid frontmatter + provenance; `test ! -e .opencode/skill/<candidate-name>` (still quarantined); `bash .opencode/tool/skill-mine-validate .opencode/.skill-mine/candidates/<name>/` → passes deterministic checks (behavioral is the promote gate); `bash .opencode/tool/verify.sh` → exit 0

### Phase 3 — Promotion + telemetry

- **[promotion] Task 3.1: Create /skill-mine promote (atomic gated move)**
  Add a `promote` subcommand: takes a candidate name, runs `skill-mine-validate` (full, incl. behavioral). If pass: atomic move `candidates/<name>/` → `.opencode/skill/<name>/`, commit with sanitized provenance (the SKILL.md frontmatter already has it), update `state.json` catalog count. If fail: reject with the gate's reason. If catalog budget exceeded: reject with budget message. Verify.sh green after.
  depends_on: [1.2, 2.2] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`, `.opencode/.skill-mine/state.json`
  Verify: promote a broken candidate → exit 1, candidate intact; promote a validated candidate → exit 0, `test -e .opencode/skill/<name>/SKILL.md`, `test ! -e .opencode/.skill-mine/candidates/<name>/`; `rg -n "source_commit|mined_date|judge_version|scope" .opencode/skill/<name>/SKILL.md` → matches; `bash .opencode/tool/verify.sh` → exit 0

- **[promotion] Task 3.2: Reuse telemetry**
  Add usage logging: when a promoted skill is invoked via `skill({ name })`, append a line to `.opencode/.skill-mine/usage.jsonl` (gitignored): `{skill, ts, session}`. Add a `usage` subcommand to `/skill-mine`: query the log, report per-skill invocation count + last-used date. This informs retirement (Phase 4).
  depends_on: [3.1] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`, `.opencode/.skill-mine/usage.jsonl` (gitignored)
  Verify: invoke a promoted skill → `test -s .opencode/.skill-mine/usage.jsonl`; `/skill-mine usage` → shows the skill with count ≥1; `git check-ignore .opencode/.skill-mine/usage.jsonl` → ignored; `bash .opencode/tool/verify.sh` → exit 0

### Phase 4 — Governance (retirement; automation deferred)

- **[governance] Task 4.1: Create /skill-mine gc (manual retirement)**
  Add a `gc` subcommand: scan promoted mined skills, for each: (a) re-run `skill-mine-validate` (re-validation); (b) check usage.jsonl for reuse in the last N sessions (default 10). If fails re-validation OR no reuse: move `.opencode/skill/<name>/` → `.opencode/.skill-mine/archive/<name>/`, commit the deletion. Manual — the user runs `/skill-mine gc` on demand. Report what was archived + why.
  depends_on: [3.2] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`
  Verify: `/skill-mine gc` with a stale skill → skill moved to archive/, `test ! -e .opencode/skill/<stale-name>`, `test -e .opencode/.skill-mine/archive/<stale-name>/SKILL.md`; `bash .opencode/tool/verify.sh` → exit 0

- **[governance] Task 4.2: Document deferred automation (no code)**
  Document in the `/skill-mine` command body + MEMORY.md: autonomous capture is deferred because no reliable post-ship completion marker exists in the plugin SDK. The signal that would justify automation: (a) a completion marker emerges (a plugin hook with success/result, or a `/ship` post-commit event), AND (b) real manual-mining usage shows the loop produces value (≥3 promoted skills with reuse). Until then, `/skill-mine` is assisted, not autonomous.
  depends_on: [4.1] · parallel: false · conflicts_with: []
  files: `.opencode/command/skill-mine.md`, `.opencode/artifacts/MEMORY.md`
  Verify: `rg -n "deferred|assisted|autonomous" .opencode/command/skill-mine.md` → matches the deferral note; `bash .opencode/tool/verify.sh` → exit 0

## Risks

| Risk | Mitigation |
|------|------------|
| Distilled skills are plausible-but-false (frozen LLM grades its own prose) | The behavioral RED/GREEN/REFACTOR gate (writing-skills contract) is the judge; promotion requires measured behavior change, not load count |
| Catalog bloat (mined skills crowd the system prompt) | Catalog budget (default 10); per-agent permissions; exceeding budget = promotion failure |
| Secret leakage via committed traces | Raw traces gitignored; only sanitized provenance committed; secret-scan before promotion |
| Candidate advertised before validation (ambient injection recurrence) | Candidates quarantined outside `.opencode/skill/`; atomic promotion only after gate; no chat/system transforms |
| Cross-runtime degradation (a skill mined on one project hurts another) | Provenance `scope: project` default; template promotion requires cross-project + cross-runtime evidence |
| Behavioral gate is expensive (subagent pressure tests) | The gate prompts for the RED/GREEN/REFACTOR evidence rather than fully automating; the build agent runs the pressure test manually during promotion |
| No real usage signal (manual mining may not produce enough data to justify automation) | Phase 4 automation is explicitly deferred; the trigger is "≥3 promoted skills with reuse" — if that never happens, the manual loop is the product |

## Open Questions

| # | Question | Status | Resolution |
|---|----------|--------|------------|
| 1 | Is `skill-mine-validate` a shell script or a bun .ts file? | Open | Shell is simpler (no compile gate needed); bun .ts gets verify.sh typecheck coverage. Decide at /plan based on gate complexity. |
| 2 | Does the behavioral gate (RED/GREEN/REFACTOR) fully automate, or prompt the build agent? | Resolved | Prompt the build agent — the writing-skills contract is a manual pressure test; full automation would require a judge model + held-out scenarios (out of scope for personal use). |
| 3 | Should mined skills be versioned (v1, v2) when re-distilled? | Open | Defer — git history IS versioning; re-distill produces a new candidate, promote replaces the old (archive the old). Decide at /plan. |
| 4 | Should the catalog budget be per-agent (different caps for build vs plan)? | Open | Default a global cap (10); per-agent is a future refinement. Decide at /plan. |
| 5 | Does `/skill-mine` need a plugin for usage telemetry, or can the command log it? | Resolved | The command logs it — `skill({ name })` invocations are visible in the session; a post-hoc `usage` subcommand reads the session log. No plugin needed (keeps sole-writer invariant). |

---

_Executable plan at `/plan skill-mine`; tasks at `/ship skill-mine`._
_Research basis: arXiv 2026 (3 parallel scout scans) + read-only review audit (5 blockers, 4 medium risks)._
