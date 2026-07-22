# Semantic Typecheck Gate

**Slug:** semantic-typecheck
**Created:** 2026-07-22
**Status:** Ready

## Bead Metadata

```yaml
depends_on: [] # standalone; follows completed template-harness-v2 roadmap
parallel: false # tasks are sequential (baseline discovery gates the rest)
conflicts_with: []
blocks: []
estimated_hours: 3
```

---

## Problem Statement

### What problem are we solving?

`verify.sh` (Check 3/4) runs a Bun compile smoke that catches syntax and import-resolution errors only, and explicitly disclaims "NOT a semantic typecheck — `typescript` is not a dependency" (`verify.sh:10-12`). Real type errors (wrong argument shapes, `unknown` assigned to `string`, undeclared methods) ship green. This was the one deferred Non-goal from the template-harness-v2 roadmap that has a concrete implementation path (`roadmap.md:119`, `MEMORY.md:56,70`).

### Why now?

The verifier-centered harness (Plans 1-4) is complete and green. The roadmap's must-have truth #2 ("One command returns truthful, reproducible verification results") is only half-met while the strongest check is syntax-only. Adding semantic typecheck closes the gap with no new infra: tsc is a devDep, not a service.

### Who is affected?

- **Primary:** the developer (personal use) running `bash .opencode/tool/verify.sh` locally.
- **Secondary:** consumers of the shipped template — they must NOT be forced to install typescript (the "ships clean" property is preserved).

---

## Scope

### In-Scope

- Add `typescript` (pinned exact) + ambient type packages (`@types/node`, `@types/bun` or `bun-types`) as devDeps in `.opencode/package.json`.
- Un-gitignore `.opencode/package.json` + `package-lock.json` so the dev repo tracks them reproducibly; relocate `.fallow/` (and handle `bun.lock`) to root `.gitignore`.
- Wire Check 4/5 into `verify.sh` (after Bun compile, before git diff): run the **nested** `tsc` binary (`--noEmit -p .opencode/tsconfig.json`); **skip gracefully** (INFO, not PASS, not FAIL) when typescript is absent so consumers stay clean.
- Fix the baseline type errors tsc surfaces (do NOT use `@ts-nocheck` or weaken `tsconfig.json`).
- Reconcile `tsconfig.json` `types` array with the chosen ambient-types package; resolve the local `bun.d.ts` shim's fate.
- Update stale docs (`verify.md`, `README.md`, `AGENTS.md`, `tech-stack.md`, `MEMORY.md`, `roadmap.md`, `state.md`).
- Re-sync `template/.opencode` and confirm consumers do NOT receive `package.json`/lockfile.

### Out-of-Scope

- Tightening `tsconfig.json` `strict: false` → `true` (separate concern; this spec keeps strictness unchanged).
- Shipping `package.json`/lockfile to consumers (sync-template.sh already excludes them; consumer gate skips when tsc absent).
- A test-runner or plugin smoke-test framework (still deferred; this adds typecheck only).
- Switching to `@typescript/native-preview`/`tsgo` (still preview per its README; TS 7.0 stable `tsc` is the production path per the 2026-07-08 announcement).
- Replacing Bun compile smoke (Check 3) — it checks syntax/import-resolution/bundling, which tsc does not; both stay.

---

## Proposed Solution

### Overview

Install `typescript@7.0.2` + `@types/node@24.12.2` + `@types/bun@1.3.14` as exact-pinned devDeps in `.opencode/package.json`. Track and **trim** `.opencode/.gitignore` (keep `node_modules`/`bun.lock`/.fallow/`; do not touch root `.gitignore`). Add Check 4/5 to `verify.sh` (after Bun compile, before git diff) that invokes the nested `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` directly (not bare `tsc`, not `npx` — both break determinism). When tsc is absent (consumer case), print an INFO/SKIP line with an install hint and do not touch the FAILURES counter. Fix the baseline type errors tsc surfaces by real narrowing and by adopting official `@types/bun` (replacing the hand-rolled `bun.d.ts` shim if it covers the spawn/kill API), not by suppressing errors. Add an isolated regression test (`verify-typecheck-test.sh`) and reconcile `.opencode/plugin/tsconfig.json`'s ambient type list.

### User Flow

1. Developer runs `bash .opencode/tool/verify.sh` → 5 checks run; typecheck PASS (tsc installed) or SKIP (tsc absent) with all others green → exit 0.
2. Consumer of shipped template runs `verify.sh` → typecheck SKIP (no tsc) + other checks green → exit 0; no install required.

---

## Requirements

### Functional Requirements

#### Offline-deterministic typecheck

- **WHEN** `.opencode/node_modules/.bin/tsc` exists **THEN** verify.sh runs it with `--noEmit -p .opencode/tsconfig.json` and reports PASS (exit 0) or FAIL (exit 1) truthfully.
- **WHEN** the binary is absent **THEN** verify.sh prints an INFO line (e.g., "SKIP: typescript not installed; semantic typecheck is dev-repo-only — run `npm install --prefix .opencode`") and does NOT count it as PASS or FAIL; other checks still gate the exit code.
- **WHEN** the check is skipped **THEN** the summary line notes the skip so a green exit is not mistaken for full verification.

#### Honest baseline

- **WHEN** tsc is first run against the current source **THEN** any type errors are fixed in-source (narrowing, correct types) rather than suppressed via `@ts-nocheck`, `any` casts, or loosened `tsconfig.json`.
- **WHEN** the local `bun.d.ts` shim conflicts with `@types/bun` **THEN** remove the shim and rely on official types; if `@types/bun` is insufficient, keep the shim and document why.

### Non-Functional Requirements

- **Performance:** tsc on ~16 small files must add negligible time (the project is tiny; TS 7 native `tsc` is fast). No network on the hot path.
- **Compatibility:** `moduleResolution: "bundler"` requires TS 5.0+; `typescript@7.0.2` satisfies it. Pin exact to match repo convention (`@opencode-ai/plugin` pinned `1.18.4`).
- **Determinism:** invoke the nested binary directly; never `npx` (may fetch), never bare `tsc` (may resolve a global unpinned compiler).

---

## Success Criteria

- [ ] `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` exits 0 (dev repo, typescript installed)
  - Verify: `cd /home/ryan/repo/opencode && .opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json; echo "exit=$?"`
- [ ] `bash .opencode/tool/verify.sh` exits 0 with 5 checks, typecheck PASS as Check 4/5 (tsc present)
  - Verify: `bash .opencode/tool/verify.sh; echo "exit=$?"`
- [ ] With tsc absent (binary path missing), verify.sh exits 0 and the typecheck check prints SKIP (not PASS, not FAIL)
  - Verify: `mv .opencode/node_modules .opencode/node_modules.bak && bash .opencode/tool/verify.sh; echo "exit=$?"; mv .opencode/node_modules.bak .opencode/node_modules` (expect exit 0 and "SKIP" in output, not "PASS" or "FAIL" for the typecheck check)
- [ ] `.opencode/package.json` and `.opencode/package-lock.json` are tracked by git
  - Verify: `git ls-files .opencode/package.json .opencode/package-lock.json` (both listed)
- [ ] Shipped template stays clean: `template/.opencode/package.json` does NOT exist after sync
  - Verify: `bash .opencode/tool/sync-template.sh && test ! -f template/.opencode/package.json && echo "consumer clean"`
- [ ] No stale "not a typecheck" / "4 checks" claims remain in shipped docs
  - Verify: `rg -n 'is NOT a semantic typecheck|typescript is not a dep|Check [0-9]/4|4/4' .opencode/tool/verify.sh .opencode/command/verify.md AGENTS.md .opencode/tech-stack.md` (no matches)

---

## Technical Context

### Existing Patterns

- `verify.sh:19-21` — `section()`/`ok()`/`bad()`/`FAILURES` accumulator pattern; `set -uo pipefail` (no `-e`, so checks don't abort early). A new check follows this shape; a `skip()` helper is needed for the absent-tsc case (prints INFO, does not increment FAILURES).
- `verify.sh:25-37` — optional-tool guard pattern (`command -v opencode` with a bun-JSON fallback). The typecheck check uses a different guard: test for the nested binary file, not `command -v` (the binary is local, not on PATH).
- `structural-check.sh:125-131` — `npx fallow --version` availability probe prints INFO (not PASS/FAIL) when absent; the typecheck SKIP follows this precedent.
- `sync-template.sh:30-44` — EXCLUDES already cover `package.json`, `package-lock.json`, `bun.lock`, `.gitignore`; consumers stay clean without changes.

### Key Files

- `.opencode/tool/verify.sh` — add Check 4/5 (typecheck, after Bun compile, before git diff), renumber N/4 → N/5 at lines 24, 40, 51, 63; update header comment (lines 7-12).
- `.opencode/tsconfig.json:17` — `types: ["node","bun-types"]` must reconcile with the installed ambient package (`["node","bun"]`); `moduleResolution: "bundler"` (line 5) needs TS 5.0+ (7.0.2 ok).
- `.opencode/plugin/tsconfig.json:12` — same stale `types: ["node","bun-types"]`; align to `["node","bun"]` only (preserve its `strict:true`).
- `.opencode/plugin/diagnostics/bun.d.ts` — hand-rolled `Bun` shim declaring only object-form `spawn` (no `kill`); `lang-runners.ts:22,31` calls array-form `spawn` + `proc.kill()` → type errors once tsc runs. Likely removed in favor of `@types/bun`.
- `.opencode/plugin/guard.ts:20` — `const cmd: string = (output.args as Record<string, unknown>)?.command ?? "";` assigns `unknown` to `string` → TS2322; needs narrowing.
- `.opencode/package.json` — add `devDependencies` block; no `scripts` block currently (AGENTS.md notes "npm run … none").
- `.opencode/.gitignore` — untracked, self-ignoring; trim to keep `node_modules`/`bun.lock`/.fallow/ (becomes tracked); do not touch root `.gitignore`.
- `.opencode/tool/verify-typecheck-test.sh` — new isolated regression test (PASS/FAIL/SKIP coverage; never mutates the checkout's real compiler).
- `.opencode/tool/sync-template.sh:30-44` — replace hardcoded `artifacts/template-harness-v2` exclusion with a generic artifact allowlist.

### Affected Files

```yaml
files:
  - .opencode/package.json # add devDependencies (typescript, @types/node, @types/bun)
  - .opencode/package-lock.json # generated by npm install; now tracked
  - .opencode/tsconfig.json # reconcile types array with chosen ambient package
  - .opencode/plugin/tsconfig.json # reconcile types array (preserve strict:true)
  - .opencode/plugin/diagnostics/bun.d.ts # likely removed if @types/bun covers spawn/kill
  - .opencode/plugin/guard.ts # fix unknown->string narrowing (line 20)
  - .opencode/plugin/diagnostics/lang-runners.ts # fix spawn/kill API if shim removed
  - .opencode/tool/verify.sh # add Check 4/5 (typecheck, skip-if-absent); renumber; update header
  - .opencode/tool/verify-typecheck-test.sh # new isolated PASS/FAIL/SKIP regression test
  - .opencode/.gitignore # trim to keep node_modules/bun.lock/.fallow (becomes tracked)
  - .opencode/tool/sync-template.sh # generic artifact allowlist (replace hardcoded exclusion)
  - .opencode/command/verify.md # document 5 checks + skip behavior
  - .opencode/command/ship.md # update the 4-check enumeration (line 60-61)
  - .opencode/README.md # Verification Baseline: add semantic typecheck
  - AGENTS.md # Commands table + Gotchas: remove "typescript not installed" stale claims
  - .opencode/tech-stack.md # update typecheck claim
  - .opencode/artifacts/MEMORY.md # supersede :56,:70 "typescript not a dep" decision
  - .opencode/roadmap.md # move semantic-typecheck out of Deferred
  - .opencode/state.md # add completed-work row + context note
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| ---- | ---------- | ------ | ---------- |
| Baseline has more type errors than the 2-3 spotted (guard.ts, lang-runners.ts) | High | Med | Task 1 discovers the full list via a standalone tsc run BEFORE Task 2 fixes; if >10 errors or an API refactor is needed, stop and surface to the user (may indicate a wrong types-package choice, not just source bugs) |
| TS 7.0 major surfaces errors TS 5.x wouldn't | Med | Low | 7.0 is the official production release (2026-07-08, "ready for CI"); fix what it flags; if a 7.0-specific strictness issue seems wrong, document and decide rather than suppress |
| `@types/bun` API differs from the hand-rolled `bun.d.ts` shim, breaking other call sites | Med | Med | Task 1 greps all `Bun.spawn`/`Bun.which`/`.kill()`/`.exited` call sites before removing the shim; keep the shim only if `@types/bun` is insufficient |
| `.fallow/` becomes unignored if nested `.gitignore` is deleted without relocating | Med | Low | Task 3 adds `.fallow/` to root `.gitignore` (and `bun.lock`/`bun.lockb` if deleting the nested file); verify with `git check-ignore` |
| Lockfile churn on every `npm install` | Low | Low | Track `package-lock.json`; use `npm ci --prefix .opencode` for reproducible installs; reserve `npm install` for dep changes only |
| Consumer verify.sh prints green despite skipped typecheck (false sense of verification) | Med | Med | SKIP prints INFO not PASS; summary line explicitly notes the skip; the other 4 checks still gate |

---

## Open Questions

| Question | Owner | Due Date | Status |
| -------- | ---- | -------- | ------ |
| `@types/bun` vs `bun-types` package? tsconfig currently says `bun-types` (older) — which is current and does its `types` entry become `["node","bun"]`? | build | Task 1 | Resolved: `@types/bun@1.3.14` (depends on `bun-types@1.3.14`); `types` entry becomes `["node","bun"]` |
| Exact baseline error count + whether `bun.d.ts` shim is removable | build | Task 1 | Open (discover via standalone tsc) |
| Delete `.opencode/.gitignore` entirely vs trim lines 2,3,5 only (keep `node_modules`/`bun.lock`/`.fallow/` local) | build | Task 3 | Resolved: trim (do not touch root `.gitignore`) |

---

## Tasks

### Task 1: Install typecheck toolchain + discover baseline [deps]

Dev repo has `typescript@7.0.2` + `@types/node` + the chosen Bun ambient types installed as exact-pinned devDeps, and a standalone tsc run reveals the complete baseline error list.

**Metadata:**

```yaml
depends_on: []
parallel: false
conflicts_with: []
files:
  - .opencode/package.json
  - .opencode/package-lock.json
  - .opencode/tsconfig.json
```

**Verification:**

- `.opencode/node_modules/.bin/tsc --version` prints `7.0.2`
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` runs and produces a known (possibly non-empty) error list — capture it for Task 2
- `node -e "console.log(require('./.opencode/package.json').devDependencies)"` lists typescript + @types/node + the Bun types package, all exact-pinned

### Task 2: Fix baseline type errors [fix]

All type errors surfaced by Task 1 are fixed in-source (real narrowing + correct types from `@types/bun`); the local `bun.d.ts` shim is removed if `@types/bun` covers the spawn/kill API, kept+documented only if insufficient; no `@ts-nocheck`, no `any` suppression, no `tsconfig.json` loosening.

**Metadata:**

```yaml
depends_on: ["Install typecheck toolchain + discover baseline"]
parallel: false
conflicts_with: []
files:
  - .opencode/plugin/guard.ts
  - .opencode/plugin/diagnostics/lang-runners.ts
  - .opencode/plugin/diagnostics/bun.d.ts
```

**Verification:**

- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` exits 0
- `rg -n '@ts-nocheck|as any' .opencode/plugin .opencode/tool` returns no new occurrences
- If `bun.d.ts` removed: `rg -n 'Bun\.(spawn|which)' .opencode/plugin` call sites still typecheck (covered by `@types/bun`)

### Task 3: Track and trim nested `.gitignore` [infra]

`.opencode/.gitignore` is trimmed (keep `node_modules`/`bun.lock`/.fallow/) and becomes tracked by git; `.opencode/package.json` + `package-lock.json` are tracked by git; root `.gitignore` is untouched; reproducibility holds across fresh clones.

**Metadata:**

```yaml
depends_on: []
parallel: true
conflicts_with: ["Install typecheck toolchain + discover baseline"]
files:
  - .opencode/.gitignore
```

**Verification:**

- `git ls-files .opencode/package.json .opencode/package-lock.json .opencode/.gitignore` lists all three
- `git check-ignore .opencode/.fallow .opencode/bun.lock .opencode/node_modules` shows all still ignored
- `git check-ignore .opencode/package.json .opencode/package-lock.json .opencode/.gitignore` returns nothing (un-ignored)
- `rg -n '.fallow' .gitignore` returns no matches (root .gitignore untouched)

### Task 4: Wire semantic typecheck into verify.sh (Check 4/5, skip-if-absent) [gate]

`verify.sh` runs a 5th check, positioned as Check 4/5 (after Bun compile, before git diff), invoking the nested `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` directly; PASS when green, FAIL when red, SKIP (INFO, not counted) when the binary is absent; existing N/4 labels renumbered to N/5; header comment updated to drop the "NOT a semantic typecheck" disclaimer.

**Metadata:**

```yaml
depends_on: ["Fix baseline type errors", "Track and trim nested .gitignore"]
parallel: false
conflicts_with: []
files:
  - .opencode/tool/verify.sh
  - .opencode/tool/verify-typecheck-test.sh
```

**Verification:**

- `bash .opencode/tool/verify.sh` exits 0; output shows "Check 4/5" with PASS (tsc present)
- `bash .opencode/tool/verify-typecheck-test.sh` exits 0 (isolated PASS/FAIL/SKIP regression passes)
- `mv .opencode/node_modules .opencode/node_modules.bak && bash .opencode/tool/verify.sh; echo "exit=$?"; mv .opencode/node_modules.bak .opencode/node_modules` → exit 0 and typecheck line shows "SKIP" (not PASS, not FAIL)
- `rg -n 'Check [0-9]/4|4/4' .opencode/tool/verify.sh` returns no matches (renumbered)

### Task 5: Update stale docs + durable memory [docs]

`verify.md`, `ship.md`, `README.md`, root `AGENTS.md`, `tech-stack.md` reflect the 5-check verifier with Check 4/5 typecheck and skip-if-absent; `MEMORY.md` supersedes the "typescript not a dep" decisions at :56 and :70; `roadmap.md` moves semantic-typecheck out of Deferred; `state.md` records the completed work + context note.

**Metadata:**

```yaml
depends_on: ["Wire semantic typecheck into verify.sh (Check 4/5, skip-if-absent)"]
parallel: false
conflicts_with: []
files:
  - .opencode/command/verify.md
  - .opencode/command/ship.md
  - .opencode/README.md
  - AGENTS.md
  - .opencode/tech-stack.md
  - .opencode/artifacts/MEMORY.md
  - .opencode/roadmap.md
  - .opencode/state.md
```

**Verification:**

- `rg -n 'is NOT a semantic typecheck|typescript is not a dep|Check [0-9]/4|4/4' .opencode/tool/verify.sh .opencode/command/verify.md .opencode/command/ship.md AGENTS.md .opencode/tech-stack.md` returns no matches
- `rg -n 'semantic typecheck|4/5|skip-if-absent' .opencode/command/verify.md .opencode/command/ship.md` returns matches (new docs present)

### Task 6: Generic export policy + artifact finalization [sync]

`template/.opencode` is regenerated; consumers do NOT receive `package.json`/lockfile or any working planning artifacts; `sync-template.sh` uses a generic artifact allowlist (ship only `artifacts/MEMORY.md`, `artifacts/todo.md`, `artifacts/example/**`); final `verify.sh` exits 0; the shipped verifier's skip-if-absent behavior protects consumers; spec/prd/plan marked Complete and `.opencode/artifacts/.active` removed.

**Metadata:**

```yaml
depends_on: ["Update stale docs + durable memory"]
parallel: false
conflicts_with: []
files:
  - .opencode/tool/sync-template.sh
  - .opencode/.template-manifest.json # regenerated
  - template/.opencode/* # regenerated (untracked)
  - .opencode/artifacts/semantic-typecheck/spec.md # mark Complete
  - .opencode/artifacts/semantic-typecheck/prd.json # mark Complete
  - .opencode/artifacts/semantic-typecheck/plan.md # mark Complete
  - .opencode/artifacts/.active # remove
```

**Verification:**

- `bash .opencode/tool/sync-template.sh` succeeds
- `test ! -f template/.opencode/package.json && echo "consumer clean"`
- `test ! -e template/.opencode/artifacts/semantic-typecheck && echo "no working artifacts leaked"`
- `test -f template/.opencode/artifacts/MEMORY.md && test -f template/.opencode/artifacts/todo.md && test -f template/.opencode/artifacts/example/spec.md && echo "allowlisted artifacts present"`
- `npm_config_offline=true bash template/.opencode/tool/verify.sh; echo "exit=$?"` → exit 0 and typecheck line shows "SKIP"
- `test ! -e .opencode/artifacts/.active && echo "artifact closed"`
- `bash .opencode/tool/verify.sh` exits 0

---

## Dependency Legend

| Field            | Purpose                                           | Example                                    |
| ---------------- | ------------------------------------------------- | ------------------------------------------ |
| `depends_on`     | Must complete before this task starts             | `["Fix baseline type errors"]`             |
| `parallel`       | Can run concurrently with other parallel tasks    | `true` / `false`                           |
| `conflicts_with` | Cannot run in parallel (same files)               | `["Install typecheck toolchain"]`          |
| `files`          | Files this task modifies (for conflict detection) | `[".opencode/tool/verify.sh"]`             |

---

## Notes

- **Research basis (2026-07-22):** TypeScript 7.0.2 is the production release (Microsoft devblog 2026-07-08, "ready for CI pipelines today"); `@typescript/native-preview`/`tsgo` is still preview per its README. Bun has no native typecheck (Bun docs describe a transpiler; Bun 1.3 release notes use `bunx tsc --noEmit`). `tsc -p .opencode/tsconfig.json` is the correct non-root-tsconfig invocation (TS docs, 2026-07-20). `moduleResolution: bundler` needs TS 5.0+ (TS 5.0 release notes).
- **Consumer-clean invariant:** `sync-template.sh:35-37` excludes `package.json`/`package-lock.json`/`bun.lock`; the user's tradeoff choice ("Consumers unaffected (sync excludes them). Dev repo gains real tsc") is honored by skip-if-absent, not by shipping the dep.
- **Stop condition:** if Task 1 reveals >10 baseline errors or an API refactor (not just narrowing), stop and surface to the user before mass-fixing — may indicate the types-package choice is wrong rather than the source being buggy.
