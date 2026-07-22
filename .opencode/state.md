---
purpose: Current project state, active decisions, blockers, and position tracking
updated: 2026-07-22
---

# State

## Current Position

**Active Plan:** skill-mine — Plans 1–5 shipped; Plans 6–7 pending
**Status:** Plan 5 (Promotion + Release Transaction) complete + shipped; atomic promote + rollbackPromote + crash recovery + full isolated lifecycle integration test green (114 tests)
**Started:** 2026-07-22
**Phase:** skill-mine — Plans 1–5 done, Plan 6 next

## Recent Completed Work

| When | Work | Summary |
| ---- | ---- | ------- |
| 2026-07-22 | `/init --deep` + `--context` | Created AGENTS.md, tech-stack.md, roadmap.md, state.md |
| 2026-07-22 | Deep research (scout/explore/review) | Evidence for verifier-centered harness; old maintenance roadmap rejected |
| 2026-07-22 | Model config tuning | `small_model` → gpt-5.4-mini; all `gpt-5.6-sol` → `gpt-5.6-sol-fast` |
| 2026-07-22 | Plan persisted | `.opencode/artifacts/template-harness-v2/plan.md` + roadmap/state/MEMORY updated |
| 2026-07-22 | Plan 1 shipped | `verify.sh` (deterministic offline runner), `structural-check.sh` PASS-after-FAIL fix, `verify.md` read-only adapter, `ship.md` linear single-writer (502→142 lines); verify.sh green (exit 0) |
| 2026-07-22 | Plan 2 shipped | Removed `prompt-leverage.ts` + `session-summary.ts` + 4 helpers; updated plugin/README.md, README.md, AGENTS.md; verify.sh green |
| 2026-07-22 | Pushed to GitHub | Public repo `ryan-brosas/original-opencode-template`; commit `0b429a7` (24 files, +1091/-1639); `template/` excluded (Model A) |
| 2026-07-22 | Restart + continuity check | opencode restarted; prompt-leverage/session-summary no longer loaded (verified: prompts arrive unwrapped); state.md updated as continuity mechanism |
| 2026-07-22 | Plan 3 shipped | Rewrote `fix.md` (verify.sh loop, no guessed npm), aligned `build.md` (sole writer, finalized permissions), marked batch-implement + dev-lifecycle DORMANT; verify.sh green |
| 2026-07-22 | Plan 4 Tasks 1-2 on disk | Narrowed `plan.md` bash to deny-first; added `task:false`+`apply_patch:false`+deny-first bash to general/explore/review/scout; general→read-only; `task:false` confirmed via debug; needs restart for full verification |
| 2026-07-22 | Plan 4 complete + committed | After restart, verified all 4 specialists read-only via `opencode debug agent` (last-match-wins); found+fixed write-bypass gap (explore/review write:deny); committed `0a1a4f9`, pushed to GitHub |
| 2026-07-22 | Deferred items resolved | (1) wired `instructions:["AGENTS.md"]` (root map was NOT auto-injected); (2) `tool/sync-template.sh` export mechanism + reconciled `template/.opencode` (594 files, manifest regenerated); (3) README dead refs + stale `npm run` Verification Baseline fixed; (4) `plugin/sdk/` audit: no shared contract → deferred; verify.sh green, diff clean |
| 2026-07-22 | Auto-ship wired | `build.md` commits+pushes after verify.sh exits 0 on a completed work unit; `git commit`/`push` flipped ask→allow, force-push + hook-bypass denied; `/ship` Close rewritten to reference the standing rule |
| 2026-07-22 | Auto-ship landed | After restart, build agent loaded allow; committed `df05bc5` (4 files), pushed `f63f03d..df05bc5 main -> main`. Auto-ship is LIVE. Gotcha learned: commit message body must not contain the literal `--no-verify` or it trips the `*--no-verify*` deny rule |
| 2026-07-22 | `/plan semantic-typecheck` | Plan written (448 lines, 4 plans/8 tasks); spec/prd reconciled with review-audit corrections (Check 4/5, nested gitignore trim, plugin/tsconfig, isolated regression test, generic export, finalization); pins `typescript@7.0.2`+`@types/bun@1.3.14`+`@types/node@24.12.2`; awaiting `/ship` |
| 2026-07-22 | semantic-typecheck shipped | 5-check `verify.sh` (typecheck = Check 4/5, nested pinned `tsc`, consumer SKIP); `typescript@7.0.2`+`@types/bun@1.3.14`+`@types/node@24.12.2` tracked; 3 baseline errors fixed (`guard.ts:20` narrowing, removed `bun.d.ts` shim); `verify-typecheck-test.sh` isolated regression test; `sync-template.sh` generic artifact allowlist; docs updated; verify.sh green |
| 2026-07-22 | Template ships typecheck deps | Consumer-clean reversed: `sync-template.sh` ships `package.json`/`package-lock.json`; consumers run `npm ci --prefix .opencode` for 5/5; template verify = 5/5 PASS (was 4+SKIP); SKIP path kept as fresh-checkout fallback |
| 2026-07-22 | `/create skill-mine` | Full PRD (358 lines) + prd.json (194 lines): self-extending governed skill library; 6-stage lifecycle, ignored quarantine, phased delivery, 8 success criteria; deep research (3 explore + 1 scout + 1 review) |
| 2026-07-22 | `/plan skill-mine` | Plan written (7 serial child plans, 16 TDD tasks, 15 artifacts); spec/prd reconciled with 12 Required PRD Corrections (review audit P1 contradictions); Discovery Level 3; awaiting `/ship` |
| 2026-07-22 | skill-mine Plan 1 shipped | Control plane + validation contracts: tracked `.opencode/skill-mine.json`, `tool/skill-mine/{config,schema}.ts` (loadConfig/bootstrapRuntime + validateSkill generic+mined-admission + privacy scan), `skills.paths` registered, `.skill-mine` gitignored, sync excludes project-skills + runtime; 22 bun tests pass, typecheck + verify.sh 5/5 green |
| 2026-07-22 | skill-mine Plan 2 shipped | Completion evidence + private capture: `types.ts` + `receipts.ts` (prepareReceipt/finalizeReceipt, git binding, idempotency, no-new-commit guard) + `capture.ts` (commit-type check, tree re-validate, privacy scan over summary/risks/paths) + `cli.ts` (prepare/finalize/capture) + schema `scanFreeText` export (ASIA + long-hex entropy); ship flow wired (build.md/ship.md). Read-only review found 7 P1+4 P2; fixed 6 P1+2 P2 inline (traversal, nested-check, idempotency, tree-OID, no-new-commit, ASIA, path-escape, perms); rejected ls-remote (offline mandate); deferred atomic-write + consumer-ignore to Plan 7. 44 tests pass, verify.sh 5/5 green |
| 2026-07-22 | skill-mine Plan 3 shipped | Candidate admission + behavioral approval: `loader.ts` (isolated temp-project loader, file-redirect fix for opencode stdout truncation) + `candidate.ts` (quarantine writeCandidate, smokeHelpers, validateCandidate) + `evaluate.ts` (hash-bound approval: baseline must fail, 2 treatments pass ≥4/5, independent judge, contentHash invalidation) + `cli.ts` distill/evaluate + `command/skill-mine.md` (lifecycle orchestration). 72 tests pass, verify.sh 5/5 green |
| 2026-07-22 | skill-mine Plan 4 shipped | Governance before promotion: `lifecycle.ts` (retire/restore/recover: lock+journal+same-filesystem rename, crash recovery/rollback, rejects non-mined, idempotent) + `budget.ts` (scanMinedSkills, checkBudget count+per-desc+aggregate, checkTemplatePromotionEvidence ≥2 projects+≥2 models) + `cli.ts` retire/restore/recover/budget subcommands + `command/skill-mine.md` retire/restore docs. 98 tests pass, verify.sh 5/5 green |
| 2026-07-22 | skill-mine Plan 5 shipped | Promotion + release transaction: `lifecycle.ts` promote (7 guards: lint revalidate, helper smoke, hash-bound approval, lock, destination collision, budget projection, template-scope evidence; atomic rename; no Git ops) + rollbackPromote (active→quarantine after outer release failure) + extended recover for promote journals; `cli.ts` validate/promote/rollback subcommands; `skill-mine-integration-test.sh` full lifecycle end-to-end (receipt→capture→distill→evaluate→validate→promote→fresh-process loader→retire→restore→rollback→template-scope promote with evidence); `command/skill-mine.md` promote/validate/rollback docs. 114 tests pass, verify.sh 5/5, integration test PASSED, fresh-process loader confirmed, no leaks. |

## Active Decisions

| Date | Decision | Rationale |
| ---------- | -------------------------------------------------------- | -------------------------------------------------------- |
| 2026-07-22 | Replace maintenance-first roadmap with verifier-centered harness | Research evidence favors linear loop, structured verification, prompt fidelity |
| 2026-07-22 | Simplify aggressively: remove prompt-leverage + session-summary | User selected; prompts reach model unrewritten, compaction at phase boundaries |
| 2026-07-22 | `.opencode/` canonical; `template/.opencode` export deferred | Sync is not first-class; export deferred to a release mechanism |
| 2026-07-22 | `structural-check.sh` exits 1 on failure (not 0) | Verified: docs were stale; real bug is misleading PASS-after-FAIL message |
| 2026-07-22 | Auto ship on completion: commit + push after verify | User wants per-artifact auto commit+push; verify.sh is the gate; subagents stay read-only; force-push + hook-bypass denied |
| 2026-07-22 | Semantic typecheck gate = verify.sh Check 4/5 | Exact-pinned devDeps tracked; nested pinned `tsc` (offline); consumer SKIP; isolated regression test; strictness migration non-goal |
| 2026-07-22 | Template ships typecheck deps (consumer-clean reversed) | Template should run 5/5 like dev; SKIP path kept as fresh-checkout fallback; consumers carry pinned lockfile |
| 2026-07-22 | skill-mine corrected full lifecycle | Tracked config + finalized receipts; deterministic lint split from hash-bound behavioral approval; retire/restore before promotion; separate project/template skill roots; `/ship` owns Git release; telemetry is live-hook spike with manual fallback |

## Blockers

| Bead | Blocker | Since | Owner |
| ------ | ------- | ----- | ----- |
| — | (none) | — | — |

## Context Notes

### Technical

- `structural-check.sh` **exits 1 on failure** — docs claiming "exits 0" are stale and wrong. Real bug: unconditional `pass "All files within size limits"` at line 92 printed after a recorded size violation.
- `prompt-leverage.ts` removed (Plan 2) — confirmed gone after restart: prompts arrive unwrapped (no Objective/Context/Work Style framework).
- `session-summary.ts` + helpers removed (Plan 2) — confirmed gone after restart: no `<session_summary>` block in context. Continuity now relies on file-based memory (this file + MEMORY.md + progress.md), not every-turn injection.
- Semantic typecheck is now live: `verify.sh` Check 4/5 runs `.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json` (typescript@7.0.2 pinned). `npx tsc` at repo root is still a stub, but the nested pinned compiler is real — install with `npm ci --prefix .opencode`. Templates now ship the manifest too (consumer-clean reversed); consumers run `npm ci --prefix .opencode` for 5/5, or get a SKIP install hint on fresh checkout.
- `opencode.json instructions: ["AGENTS.md"]` wired — root `AGENTS.md` (project map) now auto-injected alongside `.opencode/AGENTS.md` (kernel, native). Verified: my system prompt carried only `.opencode/AGENTS.md` before wiring. Requires restart to take effect.

### Product

- Template consumed by personal projects (e.g. `personal-website/.opencode/opencode.json`).
- Scope is personal use; external onboarding out of scope.

## Next Actions

1. [x] Plan 2 Task 1: remove session-summary files — done
2. [x] Plan 2 Task 2: remove prompt-leverage.ts + update docs — done
3. [x] Plan 2 Task 3: restart + continuity check — done (file-based state complete; plugins confirmed unloaded)
4. [x] Plan 3 Task 1: rewrite `fix.md` + align `build.md` (finalize build permissions) — done
5. [x] Plan 3 Task 2: mark swarm routing dormant — done
6. [x] Plan 3 Task 3: smoke-test `/ship` without `.active` — done (ship.md:25 disowns requirement)
7. [x] Plan 4 Task 1: narrow `plan.md` bash to deny-first read-only — done
8. [x] Plan 4 Task 2: deny-first shell + task:false + apply_patch:false for general/explore/review/scout — done
9. [x] Plan 4 Task 3: restart + verify resolved permissions — done (all read-only confirmed; write gap found+fixed; committed 0a1a4f9)
10. [x] Deferred item 1: README dead refs + stale Verification Baseline — done
11. [x] Deferred item 2: wire `instructions:["AGENTS.md"]` + fix tech-stack.md claim — done (needs restart to verify injection)
12. [x] Deferred item 3: `tool/sync-template.sh` export mechanism + reconcile `template/.opencode` — done (594 files, manifest regenerated, diff clean)
13. [x] Deferred item 4: `plugin/sdk/` audit — no shared contract found, remains deferred (not speculative)
14. [x] `/plan semantic-typecheck` — plan written + spec/prd reconciled; awaiting `/ship`
15. [x] `/ship semantic-typecheck` — 5-check verifier live, typecheck Check 4/5, 3 baseline errors fixed, regression test, generic export, docs updated, committed + pushed
16. [x] `/create skill-mine` — Full PRD + prd.json; self-extending governed skill library; 6-stage lifecycle
17. [x] `/plan skill-mine` — 7-plan/16-task TDD plan; spec/prd reconciled with 12 corrections; awaiting `/ship`
18. [x] `/ship skill-mine` Plan 1 — Control plane + validation contracts shipped; config/schema TDD green; skills.paths + sync scope boundary; verify.sh 5/5
19. [x] `/ship skill-mine` Plan 2 — Completion evidence + private capture (receipts + sanitized capture)
20. [x] `/ship skill-mine` Plan 3 — Candidate admission + behavioral approval (quarantine + isolated loader + hash-bound approval)
21. [x] `/ship skill-mine` Plan 4 — Governance before promotion (retire/restore + crash recovery + catalog/scope budgets)
22. [x] `/ship skill-mine` Plan 5 — Promotion + release transaction (atomic promote, rollbackPromote, crash recovery, full isolated lifecycle integration test)
23. [ ] `/ship skill-mine` Plan 6 — Usage telemetry, gated by runtime proof

## Session Handoff

**Last Session:** 2026-07-22 (`/ship skill-mine` Plan 5 shipped: promotion + release transaction; lifecycle.ts promote + rollbackPromote + extended recover for promote journals; cli.ts validate/promote/rollback subcommands; skill-mine-integration-test.sh full lifecycle end-to-end (receipt→capture→distill→evaluate→validate→promote→fresh-process loader→retire→restore→rollback→template-scope promote); 114 tests pass, verify.sh 5/5, integration test PASSED)
**Next Session Priority:** `/ship skill-mine` Plan 6 — Usage Telemetry, Gated by Runtime Proof. Tasks: 6.1 native skill-hook proof (plugin/skill-mine-telemetry.ts: narrow observer for tool.execute.after when tool==="skill"; append-only usage.jsonl; if the built-in skill call does not reach the hook, remove/disable the observer and provide explicit `/skill-mine usage record <name>` instead); 6.2 reporting + retirement recommendations (usage.ts: counts, last-used date, evidence-backed recommendations; never auto-retire; missing telemetry = "unknown" not zero). Treat Plan 6 as one work unit; Ship-on-Completion after verify.sh green. Stop if the built-in skill call does not reach the telemetry hook (use manual fallback).
**Known Issues:** (none — Plan 5 green and shipped)
**Context Links:** `.opencode/artifacts/skill-mine/{spec,plan,progress,prd.json}`, `AGENTS.md`, `.opencode/roadmap.md`, `.opencode/artifacts/MEMORY.md`
**Repo:** https://github.com/ryan-brosas/original-opencode-template (public, main)

---

_Update at the end of each significant session or when state changes._
_This file is the "you are here" marker for the project._
