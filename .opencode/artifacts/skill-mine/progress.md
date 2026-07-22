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

## 2026-07-22 — Plan 2 shipped (Completion Evidence + Private Capture)

Two tasks, TDD (RED→GREEN per task). Plus a read-only `review` pass (high-risk:
forged receipt = false success) whose P1 findings were fixed inline.

### Task 2.1 — Provisional/finalized receipts
- `tool/skill-mine/types.ts` — `CheckResult`, `ProvisionalReceipt`, `FinalizedReceipt`,
  `ProvisionalInput`, `MinedTrace`.
- `tool/skill-mine/receipts.ts` — `prepareReceipt` (validate input, sanitize
  checks, `git write-tree` staged tree, `parentSha`, branch, write provisional at
  0600) + `finalizeReceipt` (commit-type via `cat-file`, tree/branch/remote
  binding, idempotent only for the same workUnitId, no-new-commit guard).
- `tool/skill-mine/receipts.test.ts` — 15 tests (temp git repos + bare remote):
  failed-check/empty-paths/empty-summary reject; nothing-committed → no new
  commit; tree mismatch; wrong branch; stale remote; success; idempotent;
  workUnitId traversal; changedPath escape; nested-check stripping; finalize
  conflict.

### Task 2.2 — Receipt-only sanitized capture
- `tool/skill-mine/capture.ts` — `capture(sha)`: read finalized, assert
  `receipt.commitSha === sha`, `cat-file -t` is `commit`, tree matches, privacy
  scan over summary+risks+changedPaths, write sanitized trace (checks
  reconstructed as `{id,exitCode}`) at 0600.
- `tool/skill-mine/schema.ts` — exported `scanFreeText` (reused by capture);
  added `ASIA` AWS STS pattern; entropy gate now `(distinct>=20 OR length>=64)
  AND entropy>=3.5` (catches long hex/base64 without tripping 40-char sha1).
- `tool/skill-mine/capture.test.ts` — 8 tests: no receipt; provisional-only;
  tree mismatch (forged); commit-not-found; secret in summary (AKIA); ASIA in
  summary; tree-OID forgery (not a commit); success (sanitized trace, no
  prompt/diff keys).
- `tool/skill-mine/cli.ts` — `prepare` (stdin JSON) / `finalize <id>` /
  `capture <sha>`; `SKILL_MINE_CONFIG` env override; `import.meta.main` guard.
- `agent/build.md` + `command/ship.md` — Completion Receipt step (prepare after
  stage → commit/push → finalize); optional (ships either way).

### Review pass + fixes (high-risk: security/data-integrity)
Read-only `review` subagent flagged 7 P1 + 4 P2. Fixed inline (with RED tests):
- P1 workUnitId path traversal → `WORK_UNIT_ID` pattern (no `.`/`/`).
- P1 nested check fields bypass privacy → `sanitizeChecks` keeps only
  `{id,exitCode}`; summary/risks typed.
- P1 finalize idempotency bypass → idempotent branch requires workUnitId match.
- P1 capture accepts a tree-OID → `git cat-file -t` must be `commit`.
- P1 "no new commit" → `parentSha`; finalize requires `commitSha !== parentSha`.
- P1 privacy gaps (ASIA, long hex) → added patterns/tests.
- P2 changedPath escape → normalize against cwd, reject `..`/absolute-outside;
  changedPaths included in the capture privacy scan.
- P2 permissions → explicit `chmodSync` 0700/0600 on existing paths.

Rejected (contradicts the plan's offline mandate):
- P1 `git ls-remote` for remote validation — would require network; `origin/
  <branch>` tracking ref is the correct offline signal that a push succeeded
  for a personal-use tool. Stale-ref/local-tag forgery is out of threat model.

Documented limitations / deferred:
- P2 atomic temp+rename write — a partial file fails JSON.parse (visible
  failure, not a silent bypass); rare for personal-use.
- P2 consumer `.skill-mine/` ignore propagation — dev repo is safe
  (`.opencode/.gitignore` has the rule); consumers lack it because sync excludes
  `.gitignore`. Deferred to Plan 7 (Docs/Export) which owns consumer privacy
  docs + export hygiene.

### Verification (Plan 2)
- `bun test tool/skill-mine/` → 44 pass, 0 fail (101 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS)
- `bash .opencode/tool/sync-template.sh` → 607 files; `tool/skill-mine/` ships,
  `.skill-mine/` + `project-skills/` absent, `skill-mine.json` ships
- CLI smoke (temp repo + bare remote): `prepare` → `finalize` (printed sha) →
  `capture` (printed trace path, file on disk) — end-to-end via the real binary

**Status:** Plan 2 complete + shipped. Plans 3–7 pending.

## 2026-07-22 — Plan 3 shipped (`/ship skill-mine` Plan 3)

Plan 3: Candidate Admission and Behavioral Approval. Both tasks TDD (RED → GREEN).

### Task 3.1 — Quarantine and isolated loader validation

- `loader.ts` (69 lines): `runOpencodeDebugSkill(cwd)` spawns `opencode debug skill
  --pure` with `OPENCODE_DISABLE_EXTERNAL_SKILLS=1` + `OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1`,
  redirects stdout to a temp file (spawnSync truncates on piped stdout — file-redirect
  fix), JSON.parse with array-extraction fallback; `loadInTempProject(candidateDir,
  name)` copies candidate into a `mkdtemp` project's `.opencode/skill/<name>/`, runs
  the loader, asserts exact name+description+content; `checkCollision(name, cwd)`
  queries the live catalog.
- `candidate.ts` (90 lines): `candidateDir`, `writeCandidate` (NAME_RE + 0700/0600
  perms), `smokeHelpers` (bun build each .js), `validateCandidate` (schema → smoke →
  collision → isolated loader → assert name/description match).
- 14 tests (11 candidate + 4 loader). RED: stubs → 14 fail. GREEN: 14 pass after
  file-redirect fix for opencode stdout truncation.

### Task 3.2 — Independent behavioral approval

- `evaluate.ts` (108 lines): `recordApproval(input, cfg)` validates:
  (1) candidate exists + contentHash matches (stale → reject);
  (2) baseline must fail (proves candidate is needed);
  (3) exactly 2 treatments, both pass (score >= 4);
  (4) judge independent (modelId differs from baseline + treatments — not self-judged);
  (5) judge passes (score >= 4);
  (6) approvedBy non-empty;
  (7) all summaries privacy-scanned via `scanFreeText`.
  Stores at `candidates/<name>/approval.json` at 0600.
  `loadApproval(name, cfg)` returns null if approval missing OR candidate changed
  (contentHash mismatch — invalidation).
- `cli.ts` updated: `distill <name>` (stdin = SKILL.md → writeCandidate) +
  `evaluate <name>` (stdin = ApprovalInput JSON → recordApproval).
- `command/skill-mine.md` (new): agent-facing lifecycle orchestration (capture →
  distill → evaluate → user confirms). Documents the baseline/treatment/judge flow,
  privacy rules, stop conditions.
- 14 tests. RED: stubs → 14 fail. GREEN: 14 pass.

### Verification (Plan 3, all exit 0)

- `bun test ./.opencode/tool/skill-mine/` → 72 pass, 0 fail (142 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS)
- `bash .opencode/tool/sync-template.sh` → 614 files; `.skill-mine/` + `project-skills/`
  absent, `tool/skill-mine/` + `command/skill-mine.md` + `skill-mine.json` ship
- `git diff --check` → exit 0

**Status:** Plan 3 complete + shipped. Plans 4–7 pending.

## 2026-07-22 — Plan 4 shipped (`/ship skill-mine`)

Governance Before Promotion: retire/restore + crash recovery, and catalog/scope
budgets.

### Task 4.1 — Retire, restore and crash recovery

- `lifecycle.ts` (new): `retire` moves a mined skill (metadata.origin:
  skill-mine) from its active root to the archive; rejects hand-authored
  skills. `restore` moves an archived skill back to its original scope root,
  only when the destination is free. `recover` handles crashed/interrupted
  operations by examining the journal: if the rename happened → complete; if
  not → roll back; malformed journal → remove.
- Lock = in-progress journal entry at `journal/<name>.json`. Same-filesystem
  `renameSync` for atomicity. Journal cleared on completion.
- `cli.ts` updated: `retire`, `restore`, `recover` subcommands.
- `command/skill-mine.md` updated: retire/restore/recover documentation +
  restart note (loader is startup-scanned).
- 14 tests (RED: stubs → 14 fail; GREEN: 14 pass): retire project/template,
  reject non-mined, reject missing, restore project/template, restore
  collision, retire→restore idempotency (twice), stale lock, recover
  complete/rollback/malformed/noop.

### Task 4.2 — Catalog and scope governance

- `budget.ts` (new): `scanMinedSkills` walks project + template roots, returns
  only skills with metadata.origin: skill-mine (scope must match root).
  `checkBudget` enforces global count + per-description + aggregate
  description-byte budgets. `checkTemplatePromotionEvidence` requires ≥2
  distinct projects + ≥2 distinct modelIds for template-scope promotion.
- `cli.ts` updated: `budget` subcommand (prints JSON, exits 1 if over budget).
- 12 tests (RED: stubs → 12 fail; GREEN: 12 pass): scan empty/project/template/
  hand-authored, budget pass/count-exceed/per-desc-exceed/aggregate-exceed,
  evidence pass/1-project/1-model/empty.

### Verification (Plan 4, all exit 0)

- `bun test ./.opencode/tool/skill-mine/` → 98 pass, 0 fail (195 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS)
- `bash .opencode/tool/sync-template.sh` → 618 files; project-skills +
  .skill-mine absent, budget.ts + lifecycle.ts + tool/skill-mine/ ship
- `git diff --check` → exit 0

**Status:** Plan 4 complete + shipped. Plans 5–7 pending.

## 2026-07-22 — Plan 5 shipped (`/ship skill-mine` Plan 5)

Promotion + Release Transaction. TDD: RED (stubs) → GREEN (implementation).

### Task 5.1 — Atomic promotion

- `lifecycle.ts` extended with `promote(name, cfg, opts)`:
  - 7 guards: (1) stale lock, (2) candidate exists in quarantine, (3) lint
    revalidation (schema + provenance + privacy), (4) helper smoke, (5)
    behavioral approval present + contentHash match, (6) template-scope evidence
    (≥2 projects + ≥2 modelIds), (7) budget projection (count + per-description +
    aggregate bytes) + destination collision (both active roots).
  - Acquires lock → writes journal (`operation: "promote"`) → atomic `renameSync`
    (candidate → active root) → clears journal.
  - Does NOT run Git operations — `/ship` owns the release boundary.
- `lifecycle.ts` `rollbackPromote(name, cfg)`: moves a promoted skill from its
  active root back to quarantine (after outer /ship verify/push failure).
  Lock + journal (`operation: "rollback-promote"`) + atomic rename.
- `lifecycle.ts` `recover` extended: handles `promote` and `rollback-promote`
  journal entries (complete if rename happened, rollback if it didn't).
- `Operation` type extended: `"retire" | "restore" | "promote" | "rollback-promote"`.
- `cli.ts`: `validate`, `promote`, `rollback` subcommands added. `promote` reads
  optional evidence JSON from stdin (`readStdinSafe` — TTY-aware, returns "" for
  project scope, reads piped JSON for template scope).
- `command/skill-mine.md`: validate/promote/rollback sections + lifecycle docs.
- 16 new tests (RED: stubs threw "not implemented" → 14 fail; GREEN: 14 pass +
  2 recover-promote tests). Total: 114 tests across 9 files.

### Task 5.2 — Full isolated lifecycle test

- `skill-mine-integration-test.sh` (new, ~140 lines): temp git repo + bare remote
  + temp config. Exercises the full CLI lifecycle end-to-end:
  receipt prepare/finalize → capture → distill → evaluate (hash-bound) → validate
  → promote (project scope) → retire → restore → rollback (push-failure simulation)
  → template-scope promote (with evidence) → fresh-process loader
  (`opencode debug skill --pure` from a temp project) → assertions (no leaks,
  runtime local).
- Gotchas fixed during integration:
  1. `OPENCODE` env var is set to `1` by the opencode process — `${OPENCODE:-opencode}`
     uses `1`. Fixed: `OPENCODE="$(command -v opencode || echo opencode)"`.
  2. Evidence JSON must be `{"evidence":{...}}` (wrapped), not top-level
     `{"projects":...,"modelIds":...}` — matches `PromoteOptions` shape.
  3. Template-scope promote needs the `skill` subdir to exist (`mkdir -p "$TMPL_SKILLS"`).
  4. Step 9 rollback: the skill was already in the active root (promoted in step 7,
     retired+restored in step 8) — just rollback, don't re-promote.

### Verification (Plan 5, all exit 0)

- `bun test ./.opencode/tool/skill-mine/` → 114 pass, 0 fail (220 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS)
- `bash .opencode/tool/sync-template.sh` → 619 files; project-skills +
  .skill-mine absent, tool/skill-mine/ + skill-mine-integration-test.sh ship
- `bash .opencode/tool/skill-mine-integration-test.sh` → PASSED (fresh-process
  loader FOUND the promoted skill; no project/template leak; runtime local)
- `git diff --check` → exit 0

**Status:** Plan 5 complete + shipped. Plans 6–7 pending.

## 2026-07-22 — Shipped (`/ship skill-mine` Plan 6)

Plan 6: Usage Telemetry, Gated by Runtime Proof. TDD: RED (stubs) → GREEN.

**Task 6.1 — Native skill-hook proof (data layer + plugin):**
- `tool/skill-mine/usage.ts` (new): `appendUsage` (validates shape, writes
  JSONL at 0600, records ONLY {skill, sessionID, timestamp}); `readUsage`
  (skips malformed lines, dedupes exact duplicates, empty-when-missing).
- `plugin/skill-mine-telemetry.ts` (new, 57 lines): passive observer for
  `tool.execute.after` when `tool === "skill"`. Self-contained per the
  plugin-isolation invariant — reads runtimeRoot from skill-mine.json with a
  minimal inline parse (no tool/ import). Never breaks the observed tool call
  (every branch wrapped in try/catch). Under the 300-line plugin limit.
- `cli.ts` updated: `usage record <name> [--session <id>]` (manual fallback
  when the hook is unobservable), `usage report`, `usage recommend`.
- `command/skill-mine.md` updated: telemetry section + usage commands + live
  hook proof instructions + "unknown vs unused" semantics.

**Task 6.2 — Reporting + retirement recommendations:**
- `usageReport(cfg, {skills})`: per-skill {invocations, distinctSessions,
  lastUsed, status}. Missing telemetry → "unknown" (NOT "unused"). Active
  telemetry + 0 invocations → "unused". Active + >0 → "used".
- `recommendRetirement(cfg, {skills})`: only "unused" skills (telemetry
  active, zero invocations). Excludes "unknown" (cannot be proven unused).
  Never auto-retires — returns recommendations only.

**Live hook proof (user step):** restart opencode, invoke a known skill, run
`usage report`. If invocations > 0 → plugin is live. If 0 → the native skill
call does not reach `tool.execute.after`; use `usage record <name>` manually.

**Verification (Plan 6, all exit 0):**
- `bun test ./.opencode/tool/skill-mine/` → 132 pass, 0 fail (256 expect calls;
  +18 vs Plan 5's 114)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
  (plugin compiles cleanly)
- `bash .opencode/tool/structural-check.sh` → exit 0 (plugin kebab-case,
  ≤300 lines, no cross-plugin imports)
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS,
  typecheck PASS, Bun compile smoke passes the new plugin)
- `bash .opencode/tool/sync-template.sh` → 622 files; .skill-mine +
  project-skills absent (no leaks), telemetry plugin + usage.ts ship
- CLI smoke: `usage record` → 0600 perms; `usage report` → telemetryActive=true,
  2 invocations/2 sessions; `usage recommend` → [] (used skill not recommended)
- `git diff --check` → exit 0

**Status:** Plan 6 complete + shipped. Plan 7 pending.

## 2026-07-22 — Shipped (`/ship skill-mine` Plan 7: Documentation, Export + Closeout)

Final plan. All 7 child plans complete.

**Task 7.1 — User-facing documentation and export:**
- `AGENTS.md`: Layout line — added `skill-mine-telemetry` to plugin list, `skill-mine/` + `sync-template.sh` to tool list, `skill-mine` to command list; Commands table — added skill-mine CLI + integration-test rows; Gotchas — added skill-mine runtime-state + restart note.
- `.opencode/README.md`: command count 9 → 10 (+`/skill-mine`); Plugins section — added `skill-mine-telemetry.ts`; Commands table — added `/skill-mine` row; Verification Baseline — added `skill-mine-integration-test.sh`.
- `.opencode/command/skill-mine.md`: already comprehensive from Plans 3-6 (lifecycle, privacy, stop conditions, telemetry); no changes needed.
- `.opencode/tool/sync-template.sh`: **consumer `.skill-mine/` ignore hygiene (deferred Plan 2 review P2 fix)** — removed `.gitignore` from EXCLUDES so the nested `.opencode/.gitignore` ships to consumers (carries the `.skill-mine/` ignore rule); updated header comment.
- Regenerated template: 623 files (was 622; +`.gitignore`).
- Assertions: `template/.opencode/.gitignore` present (contains `.skill-mine/`); `.skill-mine/` + `project-skills/` absent; `skill-mine.json` + `tool/skill-mine/` present; consumer `git check-ignore .opencode/.skill-mine/traces/test` → ignored (confirmed).

**Task 7.2 — Durable project state:**
- `.opencode/artifacts/MEMORY.md`: appended `[2026-07-22] Skill-mine — self-extending governed skill lifecycle` decision (Context/Decision/Rationale/Consequences — 7 plans, 132 tests, telemetry outcome pending, next evidence threshold for automation).
- `.opencode/roadmap.md`: added skill-mine automation deferral to the Deferred section (auto-capture/auto-template-promotion/usage-based-auto-retirement — each needs proven evidence first).
- `.opencode/state.md`: Active Plan → "skill-mine COMPLETE"; added Plan 7 Recent Completed Work row; item 24 checked; Session Handoff rewritten (skill-mine complete; live hook proof is the user step; optional follow-ups: mine first real work unit, strictness migration, plugin/sdk).

**Task 7.3 — Finalize the artifact:**
- `spec.md` status → Complete; `prd.json` status → complete; `plan.md` status → Complete.
- `.opencode/artifacts/.active` removed (feature complete).

**Final Verification Battery (all exit 0):**
- `bun test ./.opencode/tool/skill-mine/` → 132 pass, 0 fail (256 expect calls)
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` → exit 0
- `bash .opencode/tool/structural-check.sh` → exit 0
- `npm_config_offline=true bash .opencode/tool/verify.sh` → exit 0 (5/5 PASS)
- `bash .opencode/tool/skill-mine-integration-test.sh` → PASSED (fresh-process loader confirmed, no leaks)
- `bash .opencode/tool/sync-template.sh` → 623 files; `.skill-mine/` + `project-skills/` absent, `.gitignore` ships, `tool/skill-mine/` + `command/skill-mine.md` + `skill-mine.json` + telemetry plugin ship
- `git diff --check` → exit 0

**Status:** skill-mine COMPLETE. All 7 plans shipped.
