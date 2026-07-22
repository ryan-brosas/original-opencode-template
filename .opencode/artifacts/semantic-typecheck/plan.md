# Semantic Typecheck Gate — Implementation Plan

**Status:** Complete (shipped 2026-07-22)

> **For the build agent:** implement task-by-task. You are the sole writer.
> Treat the entire `semantic-typecheck` artifact as one work unit — no interim
> auto-ship commit until the final verification battery passes (Kernel #4 gate).

**Goal:** Add an offline, deterministic semantic TypeScript gate to `verify.sh`
while preserving consumer-clean template distribution.

**Discovery Level:** 2 — current TypeScript/Bun tooling researched via scout +
registry docs; baseline error sites confirmed by explore. Review audited the
draft plan and forced four corrections (recorded below).

**Context Budget:** ~40% total, split across 4 plans so each stays under ~15%.

**Status:** ready

---

## Planning Corrections (apply before Task 1)

The draft `spec.md` / `prd.json` conflict with research-backed execution.
Reconcile them as the first write-enabled action:

1. Semantic typecheck is **Check 4/5** (after Bun compile, before git diff) —
   the draft says "5/5" which would renumber the cheap tail check into the middle.
2. Track and **trim** `.opencode/.gitignore` (keep `node_modules`, `bun.lock`,
   `.fallow/`); do **not** edit root `.gitignore`. The draft relocates `.fallow/`
   to root — unnecessary; the nested file stays tracked and owns its own state.
3. Add `.opencode/plugin/tsconfig.json` to affected files — it has
   `strict: true` and the same stale `types: ["node","bun-types"]`; align its
   type list only, preserve its strictness.
4. Add `.opencode/tool/verify-typecheck-test.sh` — an isolated regression test
   (never mutates the checkout's real compiler).
5. Add `.opencode/command/ship.md` to stale docs (it enumerates the 4 checks).
6. Replace the hardcoded `artifacts/template-harness-v2` export exclusion in
   `sync-template.sh` with a generic allowlist — otherwise this feature's
   planning docs leak into the shipped template.
7. Add artifact finalization: mark spec/prd/plan Complete and remove
   `.opencode/artifacts/.active` after verification.
8. Keep the stop condition: >10 baseline errors or an API-scale refactor
   requires user review before mass-fixing.

---

## Must-Haves

### Observable Truths

1. With dependencies installed, `verify.sh` runs semantic checking and reports PASS.
2. A compiler error produces a typecheck-specific FAIL and final exit 1.
3. Without the compiler, verification reports SKIP (not PASS, not FAIL); other
   checks still determine the exit code.
4. A fresh `npm ci --prefix .opencode` reproduces the same compiler + ambient types.
5. The generated template contains neither package manifests nor working
   planning artifacts, but still ships the verifier with SKIP behavior.
6. Documentation, memory, roadmap, and state match the implemented behavior.

### Required Artifacts

| Artifact | Provides | Path |
| --- | --- | --- |
| Tracked ignore policy | local-state ignores without hiding package metadata | `.opencode/.gitignore` |
| Exact dev dependencies | compiler + ambient types | `.opencode/package.json` |
| Reproducible graph | locked resolution | `.opencode/package-lock.json` |
| Canonical gate config | `strict:false` project | `.opencode/tsconfig.json` |
| Editor config (aligned types) | `strict:true` plugin project | `.opencode/plugin/tsconfig.json` |
| Narrowed command input | correct `string` assignment | `.opencode/plugin/guard.ts` |
| Official Bun declarations | removed local shim if covered | `.opencode/plugin/diagnostics/bun.d.ts` |
| Isolated regression test | PASS/FAIL/SKIP coverage | `.opencode/tool/verify-typecheck-test.sh` |
| Five-check verifier | truthful typecheck gate | `.opencode/tool/verify.sh` |
| Generic export policy | consumer-safe artifact shipping | `.opencode/tool/sync-template.sh` |
| Truthful operational docs | check order + SKIP semantics | `.opencode/command/{verify,ship}.md`, `AGENTS.md`, `.opencode/README.md`, `.opencode/tech-stack.md` |
| Durable closure | superseded "no typecheck" decisions | `.opencode/artifacts/MEMORY.md`, `.opencode/roadmap.md`, `.opencode/state.md` |

### Key Links

| From | To | Via | Risk |
| --- | --- | --- | --- |
| package manifest | verifier | nested `.bin/tsc` | global or missing compiler used |
| root tsconfig | plugin/tool sources | `tsc -p` | wrong ambient package or scope |
| Bun declarations | diagnostics calls | `Bun.spawn`, `Bun.which`, process APIs | local shim conflicts with official types |
| regression script | verifier | isolated temp repo | live toolchain accidentally modified |
| sync script | generated template | artifact allowlist | working specs or deps leak |
| docs | runtime behavior | check ordering + SKIP | verifier truthful but guidance stale |

## Dependency Graph

```text
Planning Corrections
  -> Plan 1 / Task 1: toolchain + intentional RED
       -> Plan 1 / Task 2: source baseline GREEN
            -> Plan 2 / Task 1: verifier contract RED
                 -> Plan 2 / Task 2: verifier GREEN
                      -> Plan 3 / Task 1: operational docs
                           -> Plan 3 / Task 2: export policy + consumer verify
                                -> Plan 4 / Task 1: durable state
                                     -> Plan 4 / Task 2: closure + single auto-ship
```

All waves are serial (sole-writer constraint). One conditional checkpoint: stop
if the compiler reveals >10 errors or requires an API redesign.

---

## Plan 1: Green Standalone Typecheck

### Task 1: Track the exact toolchain and capture RED

**Needs:** corrected spec + plan (Planning Corrections above).
**Creates:** reproducible compiler install + authoritative error list.
**Files:** `.opencode/.gitignore`, `.opencode/package.json`, `.opencode/package-lock.json`, `.opencode/tsconfig.json`, `.opencode/plugin/tsconfig.json`

1. Confirm the missing capability:
   ```bash
   test ! -x .opencode/node_modules/.bin/tsc
   git check-ignore -v .opencode/package.json .opencode/package-lock.json
   ```
   Expected: tsc absent; both package files ignored.
2. Trim `.opencode/.gitignore` to keep only:
   ```text
   node_modules
   bun.lock
   .fallow/
   ```
   Do not touch root `.gitignore`.
3. Install the approved exact dependencies:
   ```bash
   npm install --prefix .opencode --save-dev --save-exact \
     typescript@7.0.2 @types/bun@1.3.14 @types/node@24.12.2
   ```
4. Change both tsconfig `types` arrays to `["node", "bun"]`. Preserve every
   other option (root keeps `strict:false`; plugin keeps `strict:true`).
5. Confirm compiler identity:
   ```bash
   .opencode/node_modules/.bin/tsc --version
   ```
   Expected: `Version 7.0.2`.
6. Run the semantic check:
   ```bash
   .opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json
   ```
   Expected RED: source-level errors (e.g. `guard.ts:20`, Bun declaration
   conflicts). Missing-ambient errors mean invalid RED — repair wiring first.
7. Record the exact diagnostic list in `progress.md`.

**Stop:** >10 diagnostics or an API-scale change → stop, surface to user.

### Task 2: Fix the source baseline to GREEN

**Needs:** Task 1's valid RED.
**Creates:** semantically valid plugin/tool TypeScript.
**Files:** `.opencode/plugin/guard.ts`, `.opencode/plugin/diagnostics/bun.d.ts`, `.opencode/plugin/diagnostics/lang-runners.ts` (only if required)

1. Re-run the compiler, confirm the same RED.
2. In `guard.ts:20`, narrow `output.args.command` with a `typeof value === "string"`
   check before assigning it to `cmd`.
3. Remove `diagnostics/bun.d.ts`; official `@types/bun` should own the global API.
4. Re-run the compiler.
5. Edit `lang-runners.ts` only if official declarations reveal a genuine API
   mismatch; otherwise leave it untouched (surgical — Kernel #3).
6. Run until GREEN:
   ```bash
   .opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json
   ```
7. Re-run the existing gate:
   ```bash
   bash .opencode/tool/verify.sh
   ```
   Expected: standalone typecheck exits 0; the existing 4-check verifier exits 0
   (typecheck is not yet wired into it — that is Plan 2).

---

## Plan 2: Verifier Behavior Contract (TDD)

### Task 1: Write an isolated regression test and observe RED

**Needs:** Plan 1 green.
**Creates:** `.opencode/tool/verify-typecheck-test.sh`.
**Files:** one new shell script.

The test must never alter the checkout's real compiler or node_modules.

**Fixture design** (built inside `mktemp -d`, cleaned via an exit trap):

1. Copy `verify.sh` into the fixture.
2. Provide a passing `structural-check.sh` stub.
3. Provide PATH stubs for `opencode` and `git`.
4. Create empty plugin/tool source dirs.
5. Create fixture-local compiler stubs only at
   `<fixture>/.opencode/node_modules/.bin/tsc`.

**Assert these cases:**

| Case | Stub | Expected typecheck line | Expected exit |
| --- | --- | --- | --- |
| success | exits 0, echoes argv | PASS | 0 |
| failure | exits 1, prints a sentinel diagnostic | FAIL | 1 |
| absent + package.json present | (none) | SKIP + `npm ci --prefix .opencode` hint | 0 |
| absent + no package.json | (none) | SKIP + dev-repo-only note (no unusable hint) | 0 |

Also assert: skipped runs report one skipped check in the summary; success/failure
stubs record the exact arguments (`--noEmit -p .opencode/tsconfig.json`).

Run against the current verifier:

```bash
bash .opencode/tool/verify-typecheck-test.sh
```

Expected RED: semantic-check output is absent (current verifier has no typecheck).

### Task 2: Implement the five-check verifier and reach GREEN

**Needs:** Task 1 RED.
**Creates:** truthful PASS/FAIL/SKIP behavior.
**Files:** `.opencode/tool/verify.sh`

**Required order:**

1. Config validation
2. Structural invariants
3. Bun compile smoke
4. TypeScript semantic typecheck (new)
5. Git-diff whitespace

**Implementation contract:**

- Invoke `"$ROOT/.opencode/node_modules/.bin/tsc"` directly.
- Args: `--noEmit -p .opencode/tsconfig.json`.
- Capture and print compiler diagnostics on failure.
- Add a `SKIP` counter that does not increment `FAILURES`.
- Add a `skip()` helper (INFO line, not PASS/FAIL — follows
  `structural-check.sh:125-131` precedent).
- If `.opencode/package.json` exists, the SKIP line suggests
  `npm ci --prefix .opencode`; otherwise report dev-repo-only (no install hint).
- Renumber existing `N/4` labels to `N/5`.
- Final success summary discloses any skipped checks.
- Drop the header "NOT a semantic typecheck" disclaimer.

**GREEN checks:**

```bash
bash -n .opencode/tool/verify.sh .opencode/tool/verify-typecheck-test.sh
bash .opencode/tool/verify-typecheck-test.sh
.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json
npm_config_offline=true bash .opencode/tool/verify.sh
```

Expected: regression test exits 0; verifier exits 0; typecheck appears as Check 4/5.

---

## Plan 3: Truthful Documentation and Distribution

### Task 1: Align operational documentation (contract test first)

**Needs:** Plan 2 green.
**Files:** `.opencode/command/verify.md`, `.opencode/command/ship.md`, `.opencode/README.md`, `AGENTS.md`, `.opencode/tech-stack.md`

**RED:**

```bash
rg -n 'NOT a semantic typecheck|typescript.*not.*depend|Check [0-9]/4|4/4|tsc.*unavailable' \
  .opencode/tool/verify.sh .opencode/command/verify.md .opencode/command/ship.md \
  .opencode/README.md AGENTS.md .opencode/tech-stack.md
```

Expected: current stale claims appear.

Update all five files with: five-check order; semantic typecheck availability;
exact local compiler command; consumer SKIP semantics; package/lockfile now
tracked in the dev repo; no claim that an npm script exists.

Re-run the search. Expected GREEN: no stale operational claims.

### Task 2: Make template export generic and prove consumer behavior

**Needs:** Task 1.
**Files:** `.opencode/tool/sync-template.sh`, `.opencode/.template-manifest.json` (generated), `template/.opencode/**` (generated, untracked)

**RED:**

```bash
bash .opencode/tool/sync-template.sh
test ! -e template/.opencode/artifacts/semantic-typecheck
```

Expected: the second command currently fails (export only excludes the previous
feature directory).

**GREEN policy:** under `artifacts/`, ship only:

- `artifacts/MEMORY.md`
- `artifacts/todo.md`
- `artifacts/example/**`

Exclude every other artifact path generically (replace the hardcoded
`artifacts/template-harness-v2` exclusion). Retain package-manifest exclusions.
Ship `verify-typecheck-test.sh` — it uses isolated fixtures and needs no compiler.

**Verification:**

```bash
bash .opencode/tool/sync-template.sh

test ! -e template/.opencode/package.json
test ! -e template/.opencode/package-lock.json
test ! -e template/.opencode/artifacts/semantic-typecheck

test -f template/.opencode/artifacts/MEMORY.md
test -f template/.opencode/artifacts/todo.md
test -f template/.opencode/artifacts/example/spec.md
test -x template/.opencode/tool/verify-typecheck-test.sh

bash template/.opencode/tool/verify-typecheck-test.sh
npm_config_offline=true bash template/.opencode/tool/verify.sh
```

Expected: generated-template verifier exits 0 and explicitly SKIPs typecheck.

Validate the manifest rejects unexpected artifacts:

```bash
bun -e '
const m = await Bun.file(".opencode/.template-manifest.json").json();
const bad = Object.keys(m.files).filter(p =>
  p.startsWith("artifacts/") &&
  p !== "artifacts/MEMORY.md" &&
  p !== "artifacts/todo.md" &&
  !p.startsWith("artifacts/example/")
);
if (bad.length) { console.error(bad.join("\n")); process.exit(1); }
'
```

---

## Plan 4: Durable Closeout

### Task 1: Update durable project truth

**Needs:** Plans 1–3 green.
**Files:** `.opencode/artifacts/MEMORY.md`, `.opencode/roadmap.md`, `.opencode/state.md`

1. Append a decision superseding the prior "TypeScript unavailable" entries
   (`MEMORY.md:56,70`).
2. Record: exact pins (`typescript@7.0.2`, `@types/bun@1.3.14`, `@types/node@24.12.2`);
   root-config gate (`strict:false`); nested plugin config stays `strict:true`;
   consumer SKIP behavior; generic artifact export allowlist.
3. Move semantic-typecheck out of `roadmap.md` Deferred; mark the follow-up done.
4. Record completion + verification evidence in `state.md`.

### Task 2: Close the active artifact and ship once

**Needs:** Task 1 + the full verification battery below.
**Files:** `.opencode/artifacts/semantic-typecheck/{spec,prd,plan,progress}.md`, `.opencode/artifacts/.active` (remove)

1. Run the full verification battery (below).
2. Mark `spec.md`, `prd.json`, `plan.md` status Complete.
3. Record exact commands, exit codes, changed paths, and results in `progress.md`.
4. Remove `.opencode/artifacts/.active` so the next `/create` does not treat
   this artifact as ongoing.
5. Re-run the base verifier:
   ```bash
   npm_config_offline=true bash .opencode/tool/verify.sh
   ```
6. Stage only the changed paths listed across Plans 1–4 and allow the standing
   **Ship on Completion** rule to commit + push once.

No interim commit: the artifact is incomplete until this task passes.

---

## Final Verification Battery

```bash
npm ci --prefix .opencode

.opencode/node_modules/.bin/tsc --version
.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json

bash .opencode/tool/verify-typecheck-test.sh
npm_config_offline=true bash .opencode/tool/verify.sh
bash .opencode/tool/structural-check.sh

bash .opencode/tool/sync-template.sh
bash template/.opencode/tool/verify-typecheck-test.sh
npm_config_offline=true bash template/.opencode/tool/verify.sh

git diff --check
```

Expected:

- TypeScript version `7.0.2`.
- Standalone tsc exits 0.
- Dev verifier: typecheck PASS, five checks, exit 0.
- Generated-template verifier: typecheck SKIP, other checks PASS, exit 0.
- Regression test covers PASS/FAIL/two SKIP branches, exits 0.
- Package files tracked in repo, absent from the generated template.
- Only allowlisted artifact files appear in the template manifest.

---

## Risks and Failure Behavior

- **>10 baseline errors or API refactor:** stop, request user review.
- **Missing ambient declarations:** fix package/config wiring before source.
- **TypeScript 7-specific incompatibility:** document evidence; consider the
  SDK-aligned compiler only if incompatibility is proven.
- **Compiler failure:** print diagnostics, continue remaining checks, exit 1.
- **Compiler absent:** explicit SKIP + skipped-count summary.
- **Fixture failure:** fail without touching the real checkout toolchain.
- **Export regression:** fail if expected files disappear or working artifacts leak.
- **Known unrelated gap:** `structural-check.sh` still probes Fallow through an
  on-demand package runner. Use `npm_config_offline=true` during acceptance.
  Do not expand this feature's scope unless that probe causes a failure.

## Stop Conditions

- Verification fails 2× on the same approach → stop, preserve evidence, escalate.
- Baseline errors exceed 10 or require an API redesign → stop, surface to user.
- Narrowing a permission or removing the shim breaks a real call site → widen
  with evidence, do not revert to broad defaults.

---

## Open Questions

No user-blocking questions remain.

Implementation-time discoveries (governed by the stop condition, not pre-approved
broad edits):

1. Exact compiler error count from Task 1.
2. Whether `lang-runners.ts` needs any change after removing the local Bun shim.

## Constitutional Compliance

- Critical git-safety patterns: none present.
- New dependencies: explicitly approved during `/create`.
- Each implementation task touches at most five tracked files.
- No type-suppression directives, broad casts, or compiler-option weakening.
- Sole-writer constraint preserved throughout.

**Constitutional compliance: PASS**
