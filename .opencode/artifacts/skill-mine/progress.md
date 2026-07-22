# Progress Log

<!-- Append-only checkpoint log for this feature. -->

## 2026-07-22 — Plan created (`/plan skill-mine`)

- Wrote `.opencode/artifacts/skill-mine/plan.md`: 7 serial child plans, 16 TDD
  tasks, 15 artifact groups. Discovery Level 3 (parallel explore + scout +
  review).
- Deep research (arXiv 2026): Self-Improving AI Coding Agents (arXiv 2607.13091),
  Self-Evolving Harnesses (2607.13683), Tool-Making (2607.08010), TRACE
  (2606.13174), Ratchet (2605.22148), SkillX (2604.04804), EvoDS (2606.03841),
  ASPIRE (2607.00272), Who-Grades-the-Grader (2607.12790), MemoHarness
  (2607.14159), CommitDistill (2605.18284), SkeMex (2606.09365). Synthesis:
  mine verified traces into executable skills, validate, store, reuse, retire;
  local files/git suffice; admission + lifecycle governance mandatory.
- Reconciled `spec.md` + `prd.json` with the 12 Required PRD Corrections from
  the read-only review audit (P1 contradictions): tracked config replaces
  ignored state; Bun TS core; finalized receipts bound to pushed trees;
  deterministic lint split from hash-bound behavioral approval; isolated
  fixtures; temp-project loader validation; separate project/template skill
  roots; retire/restore before promotion; promotion does no Git ops;
  metadata-derived catalog + byte budgets; telemetry live-hook spike with
  manual fallback; root AGENTS.md for command inventory.
- Confirmed (verified this phase): Bun 1.3.14 native `Bun.YAML.parse` (no new
  dep); `opencode debug skill --pure` lists all 65 skills; no official
  `hidden`/`archive` lifecycle field; `tool.execute.after` carries sessionID
  but native skill-invocation reach is UNVERIFIED (telemetry must spike live);
  `sync-template.sh` has no scope filter for promoted skills.
- Constitutional compliance scan: plan.md PASS (no critical git-safety
  patterns; no new deps; no type-suppression escape hatches; explicit-path
  staging only).

Verification:
- `bash .opencode/tool/verify.sh` (after plan write) — see Close.

**Status:** plan ready; awaiting `/ship skill-mine`.

## 2026-07-22 — Plan 1 shipped: Control Plane and Validation Contracts

Plan 1 (3 tasks) executed as one work unit, TDD RED→GREEN each task. All gates green.

### Task 1.1 — Tracked configuration and lazy runtime
- Created `.opencode/skill-mine.json` (tracked): schemaVersion 1, judge
  `v1-writing-skills`, max 10 active mined, 240 bytes/description, 2400
  aggregate, project root `.opencode/project-skills`, template root
  `.opencode/skill`, runtime root `.opencode/.skill-mine`.
- Created `.opencode/tool/skill-mine/config.ts`: `loadConfig` (reads + validates
  the tracked file; rejects missing/invalid version/non-positive budgets), and
  `bootstrapRuntime` (lazily creates `.skill-mine/{receipts,traces,candidates,
  journal,archive}` at 0700, idempotent).
- TDD: RED `config.test.ts` (9 tests) failed against a throwing stub; GREEN
  after implementation — 9/9 pass.

### Task 1.2 — Frontmatter, provenance and privacy schema
- Created `.opencode/tool/skill-mine/schema.ts`: `validateSkill(skillDir, mode)`
  parses frontmatter with `Bun.YAML.parse`; validates official fields (name
  regex + folder match + description) in `generic-skill` mode; in
  `mined-admission` mode additionally requires the 7 provenance metadata keys
  (origin/source_commit/mined_date/judge_version/scope/evidence_summary/
  content_hash) with origin=`skill-mine` and scope∈{project,template}.
- Privacy scan (both modes, free-text only: description + evidence_summary +
  body): rejects private-key blocks, AWS access keys (`AKIA…`), GitHub tokens
  (`ghp_…`), transcript markers (`<dcp-message-id>`/`<session_summary>`),
  absolute home paths (`/home/…`/`/Users/…`), and high-entropy tokens (≥32
  chars, ≥20 distinct, Shannon entropy ≥3.5). Returns typed `code` per
  failure.
- TDD: RED `schema.test.ts` (13 tests) failed against a stub; fixed the test's
  `withSkill` helper to create a named subdir matching each skill name (the
  random `mkdtemp` name tripped `name-folder-mismatch`); GREEN — 13/13 pass.

### Task 1.3 — Scope roots and export boundary
- RED: created `.opencode/project-skills/.gitkeep`, ran `sync-template.sh` →
  `template/.opencode/project-skills/.gitkeep` shipped (leak confirmed).
- GREEN: registered `skills.paths: [".opencode/project-skills"]` in
  `opencode.json` (verified resolves via `opencode debug config --pure`);
  gitignored `.skill-mine/` in `.opencode/.gitignore`; added `project-skills`
  and `.skill-mine` to `sync-template.sh` EXCLUDES (with header note).
- Asserted after sync: `project-skills` absent from template, `.opencode/skill/`
  present, `skill-mine.json` ships, `tool/skill-mine/` ships. Synced 601 files.

### Verification (Plan 1)
- `bun test tool/skill-mine/` → 22 pass, 0 fail (60 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
  (config.ts + schema.ts typecheck clean; .test.ts excluded per tsconfig)
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS,
  typecheck PASS)
- `opencode debug config --pure` → exit 0; `skills.paths` resolves to
  `[".opencode/project-skills"]`
- `bash .opencode/tool/sync-template.sh` → 601 files; project-skills absent,
  skill/ + skill-mine.json + tool/skill-mine present

**Status:** Plan 1 complete + shipped. Plans 2–7 pending.
