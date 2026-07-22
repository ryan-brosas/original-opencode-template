# Skill-Mine Full Lifecycle — Implementation Plan

**Status:** Complete (all 7 plans shipped 2026-07-22)

> **For the build agent:** implement task-by-task. You are the sole writer.
> Treat the entire `skill-mine` artifact as one work unit — no interim
> auto-ship commit until the final verification battery passes (Kernel #4 gate).

**Goal:** Create an auditable local lifecycle that converts verified work into
reusable OpenCode skills:

`receipt → capture → distill → validate → evaluate → promote → retrieve → retire/restore`

**Discovery Level:** 3 — lifecycle architecture, privacy boundary, state
machine, runtime hook and multi-scope distribution. Deep research via parallel
`explore` (implementation seams), `scout` (runtime APIs), and `review` (PRD
audit) subagents forced twelve corrections to the Ready PRD before planning.

**Context Budget:** 30–45% per child plan; never execute all seven in one
context. Each child plan is one `/ship` work unit after `verify.sh` is green.

**Status:** Plans 1–6 complete + shipped; Plan 7 pending.

---

## Constraints

- Assisted mining, not autonomous success inference.
- Raw messages, tool output, and diffs never enter committed provenance.
- Candidate skills stay outside all discovered skill roots.
- Build/`/ship` remains the only commit-and-push owner.
- No new dependency: use Bun 1.3.14's `YAML.parse` API.
- Skills require a fresh OpenCode process after promotion or retirement.
- Runtime state is ignored and rebuildable; tracked configuration is authoritative.

## Must-Haves

### Observable Truths

1. Only verified, pushed work units can be mined.
2. Candidates remain quarantined until admission passes.
3. Behavioral approval is independent and bound to candidate content.
4. Retire and restore work before promotion is enabled.
5. Project skills never leak into template exports.
6. Promotion is atomic and never owns the Git transaction.
7. Usage telemetry is enabled only after a live hook proof.

### Key Links

| From | To | Risk |
|---|---|---|
| ship evidence | finalized receipt | unpushed tree mined as success |
| finalized receipt | sanitized capture | raw secrets or transcript committed |
| candidate hash | behavioral approval | self-judged or stale approval promotes noise |
| admission receipts | promotion | partial admission promotes unverified skill |
| scope metadata | promotion root and export policy | project skill exported as template-wide |
| telemetry hook | local usage log | unobservable skill calls yield false "unused" |

## Required PRD Corrections

Before implementation, reconcile `spec.md` and `prd.json`:

1. Replace ignored `state.json` and `.gitkeep` defaults with tracked
   `.opencode/skill-mine.json`; create ignored runtime directories lazily.
2. Use a typed Bun CLI/core, not a shell-only validator.
3. Require finalized completion receipts bound to commit tree and successful push.
4. Split deterministic validation from behavioral RED/GREEN approval.
5. Replace the existing `memory` skill acceptance fixture with isolated
   valid/invalid fixtures.
6. Validate loader behavior in a temporary OpenCode project, never the live
   skill root.
7. Add separate active roots:
   - Project: `.opencode/project-skills/`
   - Template: `.opencode/skill/`
8. Implement retire/restore before enabling promotion.
9. Promotion performs no commit or push; outer `/ship` owns release.
10. Derive catalog counts from `metadata.origin: skill-mine`; enforce count and
    description-byte budgets.
11. Treat telemetry as a live-hook spike with an honest manual fallback.
12. Update root `AGENTS.md`, not `.opencode/AGENTS.md`, for command inventory.

## Required Artifacts

| Artifact | Purpose |
|---|---|
| `.opencode/skill-mine.json` | Tracked schema, roots, judge and catalog budgets |
| `.opencode/tool/skill-mine/config.ts` | Configuration and runtime bootstrap |
| `.opencode/tool/skill-mine/schema.ts` | YAML/frontmatter, provenance and privacy validation |
| `.opencode/tool/skill-mine/receipts.ts` | Provisional/final completion receipts |
| `.opencode/tool/skill-mine/capture.ts` | Receipt-only sanitized trace capture |
| `.opencode/tool/skill-mine/candidate.ts` | Quarantine and isolated loader checks |
| `.opencode/tool/skill-mine/evaluate.ts` | Hash-bound behavioral approvals |
| `.opencode/tool/skill-mine/lifecycle.ts` | Promote/retire/restore locking and journal |
| `.opencode/tool/skill-mine/budget.ts` | Catalog and description budgets |
| `.opencode/tool/skill-mine/usage.ts` | Usage records and recommendations |
| `.opencode/tool/skill-mine/cli.ts` | Deterministic CLI entry point |
| `.opencode/tool/skill-mine/*.test.ts` | Bun behavior tests |
| `.opencode/tool/skill-mine-integration-test.sh` | Isolated lifecycle test |
| `.opencode/command/skill-mine.md` | Agent-facing lifecycle orchestration |
| `.opencode/plugin/skill-mine-telemetry.ts` | Optional, gated native-skill observer |

## Dependency Graph

```text
Plan 1: contracts + validation
  -> Plan 2: completion receipts + capture
  -> Plan 3: candidate admission + behavioral approval
  -> Plan 4: retire/restore + budgets
  -> Plan 5: promotion + end-to-end release
  -> Plan 6: telemetry proof or manual fallback
  -> Plan 7: documentation + closeout
```

Seven serial waves. No parallel writers.

---

## Plan 1 — Control Plane and Validation Contracts

### Task 1.1 — Tracked configuration and lazy runtime

**Files:**
- `.opencode/skill-mine.json`
- `.opencode/tool/skill-mine/config.ts`
- `.opencode/tool/skill-mine/config.test.ts`

1. **RED:** Test missing/invalid configuration, runtime creation, permissions, and default values.
2. Run `bun test .opencode/tool/skill-mine/config.test.ts`; confirm failures are caused by missing behavior.
3. **GREEN:** Add tracked defaults:
   - schema version 1
   - judge `v1-writing-skills`
   - maximum 10 active mined skills
   - 240 bytes per description, 2400 aggregate
   - project/template roots
4. Lazily create `.opencode/.skill-mine/{receipts,traces,candidates,journal,archive}` with restrictive permissions.
5. **REFACTOR:** Ensure ignored state is never authoritative.

### Task 1.2 — Frontmatter, provenance and privacy schema

**Files:**
- `.opencode/tool/skill-mine/schema.ts`
- `.opencode/tool/skill-mine/schema.test.ts`

1. **RED:** Generate temporary valid/invalid skills covering names, descriptions, metadata, helper files and synthetic credential patterns.
2. Parse frontmatter with `Bun.YAML.parse`.
3. **GREEN:** Validate official fields and string-valued metadata:
   `origin`, `source_commit`, `mined_date`, `judge_version`, `scope`, `evidence_summary`, `content_hash`.
4. Implement generic-skill and mined-admission modes.
5. Reject private-key blocks, known credential formats, high-entropy values, raw transcript markers and absolute home paths.
6. **REFACTOR:** Return typed error codes instead of prose-only failures.

### Task 1.3 — Scope roots and export boundary

**Files:**
- `.opencode/opencode.json`
- `.opencode/.gitignore`
- `.opencode/project-skills/.gitkeep`
- `.opencode/tool/sync-template.sh`

1. **RED:** Assert runtime state and project skills leak into the generated template.
2. Register `.opencode/project-skills` with `skills.paths`.
3. Ignore `.skill-mine/`; exclude runtime and project-skill roots from synchronization.
4. **GREEN:** Assert project skills are absent from the template while ordinary `.opencode/skill/` entries remain.
5. Verify:
   ```bash
   OPENCODE_PURE=1 opencode debug config
   bash .opencode/tool/sync-template.sh
   npm_config_offline=true bash .opencode/tool/verify.sh
   ```

---

## Plan 2 — Completion Evidence and Private Capture

### Task 2.1 — Provisional and finalized receipts

**Files:**
- `.opencode/tool/skill-mine/types.ts`
- `.opencode/tool/skill-mine/receipts.ts`
- `.opencode/tool/skill-mine/receipts.test.ts`
- `.opencode/tool/skill-mine/cli.ts`

1. **RED:** Use temporary Git repositories and a local bare remote.
2. Assert finalization fails before commit/push, on tree mismatch, failed checks, wrong branch or stale remote.
3. **GREEN:** Add:
   - provisional receipt after verification and explicit staging;
   - verified index-tree hash;
   - commit/tree/branch binding;
   - finalization only after successful push.
4. Store only allowlisted fields: work-unit ID, SHA, tree, changed paths, check IDs/exits, summary and risks.
5. **REFACTOR:** Make receipt operations idempotent.

### Task 2.2 — Receipt-only sanitized capture

**Files:**
- `.opencode/tool/skill-mine/capture.ts`
- `.opencode/tool/skill-mine/capture.test.ts`
- `.opencode/tool/skill-mine/cli.ts`
- `.opencode/agent/build.md`
- `.opencode/command/ship.md`

1. **RED:** Capture missing, provisional, mismatched and secret-bearing receipts.
2. **GREEN:** `capture <sha>` accepts only a finalized matching receipt.
3. Normalize paths to repository-relative values; retain check identifiers rather than arbitrary command text.
4. Update ship flow:
   - verify and record evidence;
   - stage explicit changed paths;
   - prepare receipt from the staged tree;
   - commit and push;
   - finalize receipt.
5. Push/commit failure leaves the receipt provisional and unmineable.
6. Verify in a temporary repository plus the base 5/5 verifier.

---

## Plan 3 — Candidate Admission and Behavioral Approval

### Task 3.1 — Quarantine and isolated loader validation

**Files:**
- `.opencode/tool/skill-mine/candidate.ts`
- `.opencode/tool/skill-mine/candidate.test.ts`
- `.opencode/tool/skill-mine/loader.ts`
- `.opencode/tool/skill-mine/loader.test.ts`
- `.opencode/tool/skill-mine/cli.ts`

1. **RED:** Test invalid names, collisions, secret-bearing helpers, broken JS and candidates visible in the live catalog.
2. **GREEN:** Write candidates only beneath ignored quarantine.
3. Smoke helper scripts with Bun.
4. Copy candidates into a temporary project's canonical skill root.
5. Run a fresh process with external skill sources disabled; assert exact name, description, location and content hash.
6. Never copy a candidate into the real active roots during validation.

### Task 3.2 — Independent behavioral approval

**Files:**
- `.opencode/tool/skill-mine/evaluate.ts`
- `.opencode/tool/skill-mine/evaluate.test.ts`
- `.opencode/tool/skill-mine/cli.ts`
- `.opencode/command/skill-mine.md`

1. **RED:** Reject missing, stale, self-judged and hash-mismatched approval records.
2. Implement `/skill-mine distill` and `/skill-mine evaluate`.
3. Evaluation sequence:
   - `general` subagent baseline without candidate;
   - two fresh treatment runs with candidate content;
   - independent `review` judge scores the fixed rubric;
   - baseline must fail; both treatments must pass >=4/5;
   - user confirms promotion eligibility.
4. Store only scores, hashes, model IDs and sanitized evidence summaries.
5. Candidate changes invalidate prior approval.

---

## Plan 4 — Governance Before Promotion

### Task 4.1 — Retire, restore and crash recovery

**Files:**
- `.opencode/tool/skill-mine/lifecycle.ts`
- `.opencode/tool/skill-mine/lifecycle.test.ts`
- `.opencode/tool/skill-mine/cli.ts`
- `.opencode/command/skill-mine.md`

1. **RED:** Test collision, interruption, stale lock, malformed journal and restore conflicts.
2. **GREEN:** Implement lock + operation journal + same-filesystem rename.
3. `retire` moves only mined skills into ignored archive.
4. `restore` reinstates the original scope only when destination is free.
5. Add recovery/rollback for incomplete operations.
6. Run retire->restore twice to prove idempotency.

### Task 4.2 — Catalog and scope governance

**Files:**
- `.opencode/tool/skill-mine/budget.ts`
- `.opencode/tool/skill-mine/budget.test.ts`
- `.opencode/tool/skill-mine/lifecycle.ts`
- `.opencode/tool/skill-mine/cli.ts`
- `.opencode/tool/sync-template.sh`

1. **RED:** Exceed count/description budgets and attempt template promotion with insufficient evidence.
2. Count only `metadata.origin: skill-mine`.
3. Enforce global count plus per-description and aggregate-byte budgets.
4. Project scope targets `.opencode/project-skills`.
5. Template scope targets `.opencode/skill` and requires evidence from at least two projects and two runtime/model identities.
6. Assert project-scoped fixtures never enter the template manifest.

---

## Plan 5 — Promotion and Release Transaction

### Task 5.1 — Atomic promotion

**Files:**
- `.opencode/tool/skill-mine/lifecycle.ts`
- `.opencode/tool/skill-mine/lifecycle.test.ts`
- `.opencode/tool/skill-mine/cli.ts`
- `.opencode/command/skill-mine.md`

1. **RED:** Reject absent lint approval, absent behavioral approval, stale content hash, active lock, destination collision, budget overflow and wrong scope evidence.
2. **GREEN:** Revalidate immediately before promotion.
3. Acquire lock, write journal, atomically rename to the correct active root.
4. Do not run Git operations from the lifecycle code.
5. On outer verification/release failure, move the skill back to quarantine.

### Task 5.2 — Full isolated lifecycle test

**Files:**
- `.opencode/tool/skill-mine-integration-test.sh`
- `.opencode/command/skill-mine.md`

1. Create a temporary project and local bare remote.
2. Exercise:
   - receipt prepare/finalize;
   - capture;
   - quarantine;
   - deterministic admission;
   - hash-bound behavioral receipt fixture;
   - promote;
   - fresh-process loader;
   - retire;
   - restore;
   - push-failure rollback.
3. Confirm runtime state stays ignored.
4. Confirm no project-scoped skill appears in generated template output.
5. Run the integration script and base verifier.

---

## Plan 6 — Usage Telemetry, Gated by Runtime Proof

### Task 6.1 — Native skill-hook proof

**Files:**
- `.opencode/plugin/skill-mine-telemetry.ts`
- `.opencode/tool/skill-mine/usage.ts`
- `.opencode/tool/skill-mine/usage.test.ts`
- `.opencode/command/skill-mine.md`

1. **RED:** Invoke a known skill after restart and prove no usage record exists.
2. Add a narrow observer for `tool.execute.after` when `tool === "skill"`.
3. Append only `{skill, sessionID, timestamp}` to ignored local JSONL.
4. Record no prompts, skill content or tool output.
5. Restart and perform a live invocation.
6. **Fallback:** if the native skill call does not reach the hook, remove/disable the observer and provide explicit `/skill-mine usage record <name>` instead.

### Task 6.2 — Reporting and retirement recommendations

**Files:**
- `.opencode/tool/skill-mine/usage.ts`
- `.opencode/tool/skill-mine/usage.test.ts`
- `.opencode/command/skill-mine.md`

1. **RED:** Test malformed/duplicate records and misleading "unused" calculations.
2. Add counts, last-used date and evidence-backed retirement recommendations.
3. Never retire automatically.
4. Missing telemetry produces "unknown," not zero usage.
5. Re-run structural checks; plugin must remain within its size limit.

---

## Plan 7 — Documentation, Export and Closeout

### Task 7.1 — User-facing documentation and export

**Files:**
- `AGENTS.md`
- `.opencode/README.md`
- `.opencode/command/skill-mine.md`
- `.opencode/tool/sync-template.sh`
- `.opencode/.template-manifest.json`

Document commands, restart behavior, scopes, privacy, manual fallback and task-specific gates. Regenerate the template and assert project skills/runtime files remain absent.

### Task 7.2 — Durable project state

**Files:**
- `.opencode/artifacts/MEMORY.md`
- `.opencode/roadmap.md`
- `.opencode/state.md`

Record the architecture decision, completed phases, telemetry outcome, known limitations and next evidence threshold for more automation.

### Task 7.3 — Finalize the artifact

**Files:**
- `.opencode/artifacts/skill-mine/spec.md`
- `.opencode/artifacts/skill-mine/prd.json`
- `.opencode/artifacts/skill-mine/plan.md`
- `.opencode/artifacts/skill-mine/progress.md`
- `.opencode/artifacts/.active`

Mark records Complete, append exact verification evidence, clear the active pointer, then release through the standing ship rule.

---

## Final Verification Battery

```bash
npm ci --prefix .opencode
bun test .opencode/tool/skill-mine
bash .opencode/tool/skill-mine-integration-test.sh
.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json
npm_config_offline=true bash .opencode/tool/verify.sh
bash .opencode/tool/structural-check.sh
bash .opencode/tool/sync-template.sh
npm ci --prefix template/.opencode
npm_config_offline=true bash template/.opencode/tool/verify.sh
git diff --check
```

Additional assertions:

- Runtime directory is ignored and absent from Git status.
- Project-scoped fixture is absent from template and manifest.
- Template-scoped fixture is present.
- Candidate is absent from the live catalog before promotion.
- Fresh process loads the exact promoted skill after promotion.
- Retire/restore and rollback tests pass.
- Synthetic credentials are rejected.
- Finalized receipts cannot be forged from unpushed or mismatched trees.

## Risks and Stop Conditions

- No finalized receipt matching commit/tree/push -> do not capture.
- Behavioral approval not independent and content-hash-bound -> do not promote.
- Isolated loader cannot prove exact candidate identity -> do not promote.
- Retire/restore or recovery tests fail -> promotion remains disabled.
- Project-scoped content appears in template export -> block release.
- Synthetic credential passes any gate -> stop and strengthen sanitization.
- Skill hook is not observed live -> use explicit manual telemetry.
- Catalog budget exceeded -> reject promotion without moving files.
- Candidate changes after evaluation -> invalidate approval.
- Model-based treatment does not outperform baseline twice -> keep candidate quarantined.

## Privacy and Security

- Runtime directories `0700`; local records `0600`.
- No raw prompts, tool output, patch bodies or arbitrary command strings.
- Only allowlisted receipt fields can enter capture.
- Committed provenance is minimal and sanitized.
- Human approval is required before behavioral admission and template-scope promotion.
- No lifecycle operation owns Git release; `/ship` remains the sole release boundary.

## Constitutional Compliance

- Critical Git-safety patterns: none.
- No new dependency planned.
- No type-suppression escape hatches.
- Explicit-path staging only.
- Tasks touching 4-5 files are intentional atomic slices under the user-approved corrected architecture.
- **Result: PASS.**

## Planning Report

- **Discovery Level:** 3 — lifecycle architecture, privacy boundary, state machine, runtime hook and multi-scope distribution.
- **Must-Haves:** 7 truths, 15 artifact groups, 7 critical links.
- **Context Budget:** 30-45% per child plan; never execute all seven in one context.
- **Dependency Waves:** 7 serial waves.
- **Task count:** 16 TDD tasks.
- **Effort:** XL (>2 days).
- **Plan location:** `.opencode/artifacts/skill-mine/plan.md`.

## Next Step

`/ship skill-mine` — execute the 7-plan TDD sequence. First write-enabled
action: apply the Required PRD Corrections to `spec.md` and `prd.json`, then
Plan 1 Task 1 (tracked `skill-mine.json` + lazy runtime + RED config test).
