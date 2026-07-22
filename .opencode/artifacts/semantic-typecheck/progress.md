# Progress Log

<!-- Append-only checkpoint log for this feature. -->

## 2026-07-22 — Plan created (`/plan semantic-typecheck`)

- Wrote `.opencode/artifacts/semantic-typecheck/plan.md` (448 lines): 4 serial
  plans (toolchain+baseline → verifier TDD → docs+export → closeout), 8 tasks
  total. Discovery Level 2 (scout + registry docs + review audit).
- Reconciled `spec.md` + `prd.json` with research-backed corrections from the
  read-only review audit (P1 contradiction: draft said "Check 5/5" while the
  corrected design makes typecheck Check 4/5):
  1. Typecheck is Check 4/5 (after Bun compile, before git diff) — not 5/5.
  2. Trim nested `.opencode/.gitignore` (keep node_modules/bun.lock/.fallow);
     root `.gitignore` untouched (draft relocated .fallow/ — unnecessary).
  3. Added `.opencode/plugin/tsconfig.json` to affected files (had the same
     stale `types: ["node","bun-types"]`; align only, preserve strict:true).
  4. Added `.opencode/tool/verify-typecheck-test.sh` — isolated PASS/FAIL/SKIP
     regression test (never mutates the checkout's real compiler).
  5. Added `.opencode/command/ship.md` to stale-docs task (enumerates 4 checks).
  6. Added generic artifact-export allowlist to `sync-template.sh` task
     (replace hardcoded `artifacts/template-harness-v2` exclusion — otherwise
     this feature's planning docs would leak into the shipped template).
  7. Added artifact finalization (mark spec/prd/plan Complete + remove `.active`).
  8. Kept the stop condition (>10 baseline errors or API refactor → stop).
- Resolved open questions: `@types/bun@1.3.14` (depends on `bun-types@1.3.14`,
  Bun docs confirm `types: ["bun"]`); gitignore trim (not delete, not root).
- Pinned exact versions from registry docs: `typescript@7.0.2`,
  `@types/bun@1.3.14`, `@types/node@24.12.2`.
- Marked spec/prd status Draft → Ready.
- Constitutional compliance scan: plan.md PASS (no critical git-safety patterns;
  no unjustified type-suppression directives; ≤5 files per task).

Verification:
- `node -e JSON.parse(prd.json)` → prd.json valid
- `rg` scan of plan.md for `git add .|git add -A|--no-verify|force push|--force|reset --hard|checkout .|clean -fd|@ts-nocheck|as any|@ts-ignore` → no plan.md matches (the only hits are in spec/prd, all are explicit prohibitions with documented reasons)

**Status:** plan ready; awaiting `/ship semantic-typecheck`.

## 2026-07-22 — Shipped (`/ship semantic-typecheck`)

Plans 1-4 executed as one work unit (no interim commit). All gates green.

**Changed files (staged together):**
- `.opencode/.gitignore` (trimmed: keep node_modules/bun.lock/.fallow; package files now tracked)
- `.opencode/package.json` + `.opencode/package-lock.json` (added typescript@7.0.2, @types/bun@1.3.14, @types/node@24.12.2 — exact pins)
- `.opencode/tsconfig.json` + `.opencode/plugin/tsconfig.json` (types: ["node","bun-types"] -> ["node","bun"]; root strict:false / plugin strict:true preserved)
- `.opencode/plugin/guard.ts:20` (narrow unknown -> string)
- `.opencode/plugin/diagnostics/bun.d.ts` (deleted — official @types/bun owns Bun.spawn array-form + Subprocess.kill)
- `.opencode/tool/verify-typecheck-test.sh` (new — isolated mktemp -d regression test, 4 cases, never mutates real toolchain)
- `.opencode/tool/verify.sh` (4 -> 5 checks; typecheck = Check 4/5; nested pinned tsc; consumer SKIP: npm ci hint when package.json present, dev-repo note when absent)
- `.opencode/tool/sync-template.sh` (generic artifact allowlist: ship MEMORY.md/todo.md/example/** only; removed hardcoded artifact exclusions)
- `AGENTS.md`, `.opencode/command/verify.md`, `.opencode/command/ship.md`, `.opencode/README.md`, `.opencode/tech-stack.md` (5-check docs; stale "no typecheck" claims fixed)
- `.opencode/artifacts/MEMORY.md` + `.opencode/roadmap.md` + `.opencode/state.md` (durable closeout: new decision, typecheck out of Deferred)
- `.opencode/.template-manifest.json` (regenerated, 594 files)
- `.opencode/artifacts/semantic-typecheck/{spec,prd.json,plan,progress}.md` (status -> Complete)
- `.opencode/artifacts/.active` (removed — feature complete)

**Final Verification Battery (all exit 0):**
- `npm ci --prefix .opencode` -> 0 vulnerabilities
- `.opencode/node_modules/.bin/tsc --version` -> Version 7.0.2
- `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` -> exit 0
- `bash .opencode/tool/verify-typecheck-test.sh` -> exit 0 (4/4 cases)
- `npm_config_offline=true bash .opencode/tool/verify.sh` -> exit 0 (5/5, typecheck PASS)
- `bash .opencode/tool/structural-check.sh` -> exit 0
- `bash .opencode/tool/sync-template.sh` -> 594 files synced
- `bash template/.opencode/tool/verify-typecheck-test.sh` -> exit 0 (4/4 cases)
- `npm_config_offline=true bash template/.opencode/tool/verify.sh` -> exit 0 (5/5, typecheck SKIP "dev-repo only (no package manifest)")
- `git diff --check` -> exit 0

**Plan 1 RED:** 3 standalone tsc errors (lang-runners.ts:22 spawn arg-arity, lang-runners.ts:31 missing kill, guard.ts:20 unknown->string). GREEN: guard.ts narrowing + bun.d.ts removal (lang-runners needed NO change — real @types/bun has array-form spawn + Subprocess.kill). Under the >10 stop threshold.

**Status:** shipped; artifact complete.
