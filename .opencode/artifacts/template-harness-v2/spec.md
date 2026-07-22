# Template Harness v2 — Verifier-Centered

**Bead:** thv2
**Created:** 2026-07-22
**Status:** In Progress (Plan 1 complete; Plans 2-4 pending)

## Problem Statement

### What problem are we solving?

The OpenCode template ships a maintenance-first roadmap and commands that don't
match the evidence on how coding agents work best: `/ship` routes to multi-agent
swarms with 5-parallel review and mandatory commits; `/verify` caches stale
fingerprints and instructs a read-only agent to write artifacts; `prompt-leverage.ts`
silently rewrites every user prompt; `session-summary.ts` injects context every
turn; `structural-check.sh` prints a misleading PASS after a recorded failure; docs
claim it "exits 0 on failure" (wrong — it exits 1). The result is a harness that is
unpredictable, fights the user's intent, and has no truthful one-command verifier.

### Why now?

The user rejected the maintenance-first roadmap as weak and asked for deep
research. Evidence (Agentless, AdaMAST, DISC, Anthropic/Letta context-engineering)
shows a minimal verifier-centered loop beats default swarms and self-reflection.
Personal-use scope means we optimize for reliability and useful autonomy, not
public onboarding.

### Who is affected?

- **Primary users:** the author, across personal projects that consume this template.
- **Secondary users:** none (personal use only; external onboarding out of scope).

---

## Scope

### In-Scope

- Deterministic offline verifier (`verify.sh`) + truthful structural checks
- Read-only `/verify` adapter; linear single-writer `/ship`
- Remove hidden prompt rewriting (`prompt-leverage.ts`) and every-turn context injection (`session-summary.ts`)
- Align `/fix` + build agent to the same loop; disable swarm routing
- Least-privilege effective agent permissions (specialists read-only, no recursive `task`)

### Out-of-Scope

- `plugin/sdk/` (defer until two plugins share a contract)
- TypeScript devDep / semantic typecheck while `package.json` is gitignored
- Vector/graph memory; always-on repo maps; heavy telemetry; benchmark infra
- Automated `.opencode` ↔ `template/.opencode` sync (defer to a release mechanism)
- Default multi-agent swarms / parallel writer fan-out

---

## Proposed Solution

### Overview

Replace the maintenance-first roadmap with four sequential plans that build a lean,
verifier-centered harness using existing OpenCode primitives (instructions, agent
permissions, hooks, compaction, session export) — no new infrastructure. The
build agent is the sole writer; specialists are bounded and read-only; one
deterministic verifier returns truthful results; prompts reach the model unrewritten.

### User Flow

1. User runs `/verify` → deterministic offline checks return a truthful PASS/FAIL.
2. User runs `/ship <request>` → build agent localizes, patches, verifies, reports evidence.
3. Compaction preserves intent + next step without every-turn injection.

---

## Requirements

### Functional Requirements

#### Truthful verification

- **WHEN** any check fails **THEN** the verifier exits non-zero and prints a FAIL for that check (never PASS after a recorded failure).
- **WHEN** all checks pass **THEN** the verifier exits 0.

#### Prompt fidelity

- **WHEN** a user submits a prompt **THEN** it reaches the model without hidden rewriting or every-turn context injection.

#### Single-writer execution

- **WHEN** `/ship` runs **THEN** the build agent is the only writer; no parallel writer subagents; at most one read-only review for high-risk changes.

#### Least-privilege specialists

- **WHEN** general/explore/review/scout resolve **THEN** `apply_patch` and `task` are disabled (read-only, no recursive delegation).

### Non-Functional Requirements

- **Determinism:** the verifier is offline, no-network, no-cache — every run reflects the current tree.
- **Honesty:** Bun compile smoke is labeled as such, never as semantic typecheck.

---

## Success Criteria

- [ ] `bash .opencode/tool/verify.sh` exits 1 before `ship.md` trim, 0 after
  - Verify: `bash .opencode/tool/verify.sh >/dev/null 2>&1; echo $?`
- [ ] Per-check output never prints PASS after a recorded FAIL
  - Verify: `bash .opencode/tool/structural-check.sh 2>&1 | grep -A1 FAIL`
- [ ] No plugin hooks `experimental.chat.{messages,system}.transform`
  - Verify: `rg -n 'experimental\.chat\.(messages|system)\.transform' .opencode/plugin`
- [ ] `command/ship.md` ≤ 150 lines with no batch-implement/wave/5-parallel routing
  - Verify: `test "$(wc -l < .opencode/command/ship.md)" -le 150 && ! rg -n 'batch-implement|Wave-Based|5 parallel' .opencode/command/ship.md`
- [ ] For general/explore/review/scout: `tools.apply_patch === false && tools.task === false`
  - Verify: `opencode debug agent <name> --pure` per agent

---

## Technical Context

### Existing Patterns

- Plugin pattern: `.opencode/plugin/*.ts` default-exports a `Plugin`, auto-discovered at startup (`.opencode/plugin/README.md:43-47`).
- Commands: `.opencode/command/*.md` with frontmatter `agent:` routing.
- Behavioral kernel: `.opencode/AGENTS.md` (Edit Protocol, verification discipline).

### Key Files

- `.opencode/tool/verify.sh` — deterministic offline verifier (Plan 1, done)
- `.opencode/tool/structural-check.sh` — structural invariants (Plan 1, fixed)
- `.opencode/plugin/prompt-leverage.ts` — prompt rewriting (Plan 2, to remove)
- `.opencode/plugin/session-summary.ts` + `session-summary/` — ambient injection (Plan 2, to remove)
- `.opencode/command/{verify,ship,fix}.md` — command docs (Plans 1, 3)
- `.opencode/agent/{build,plan,general,explore,review,scout}.md` — agent permissions (Plans 3, 4)
- `.opencode/opencode.json` — central permission policy (Plan 4)

### Affected Files

```yaml
files:
  - .opencode/tool/verify.sh
  - .opencode/tool/structural-check.sh
  - .opencode/command/verify.md
  - .opencode/command/ship.md
  - .opencode/command/fix.md
  - .opencode/plugin/prompt-leverage.ts
  - .opencode/plugin/session-summary.ts
  - .opencode/plugin/session-summary/*.ts
  - .opencode/plugin/README.md
  - .opencode/README.md
  - .opencode/agent/build.md
  - .opencode/agent/plan.md
  - .opencode/agent/general.md
  - .opencode/agent/explore.md
  - .opencode/agent/review.md
  - .opencode/agent/scout.md
  - .opencode/opencode.json
  - .opencode/workflows/batch-implement.md
  - .opencode/workflows/development-lifecycle-workflow.md
  - .opencode/tech-stack.md
  - AGENTS.md
```

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Removing session-summary loses compaction continuity | Med | Med | Forced-compaction test is a hard gate; keep a compaction-only hook if built-in compaction fails |
| Single-writer trades parallel speed for predictability | High | Low | Accepted — predictability > speed for personal use |
| Narrow permissions add approval friction | Med | Low | Verify resolved config via `opencode debug agent`, widen one rule with evidence if a real workflow breaks |

---

## Open Questions

| Question | Owner | Due Date | Status |
| --- | --- | --- | --- |
| Does built-in compaction preserve intent + paths + next step without session-summary? | author | Plan 2 | Open |

---

## Tasks

### Plan 1 — Truthful verification and shipping loop [feature]

Deterministic offline verifier + linear single-writer `/ship`; truthful structural checks.

**Metadata:**

```yaml
depends_on: []
parallel: false
conflicts_with: []
files:
  - .opencode/tool/verify.sh
  - .opencode/tool/structural-check.sh
  - .opencode/command/verify.md
  - .opencode/command/ship.md
  - .opencode/tech-stack.md
  - AGENTS.md
```

**Verification:**

- `bash .opencode/tool/verify.sh >/dev/null 2>&1; echo $?` → 0
- `test "$(wc -l < .opencode/command/ship.md)" -le 150`

**Status:** COMPLETE (2026-07-22)

### Plan 2 — Prompt fidelity and lean context [feature]

Remove prompt rewriting and every-turn context injection; verify compaction continuity.

**Metadata:**

```yaml
depends_on: ["Plan 1 — Truthful verification and shipping loop"]
parallel: false
conflicts_with: []
files:
  - .opencode/plugin/prompt-leverage.ts
  - .opencode/plugin/session-summary.ts
  - .opencode/plugin/session-summary/persist.ts
  - .opencode/plugin/session-summary/serialize.ts
  - .opencode/plugin/session-summary/tracking.ts
  - .opencode/plugin/session-summary/types.ts
  - .opencode/plugin/README.md
  - .opencode/README.md
```

**Verification:**

- `rg -n 'experimental\.chat\.(messages|system)\.transform|PromptLeverage|SessionSummaryPlugin' .opencode/plugin` → no matches
- Forced-compaction test preserves intent, modified paths, constraints, next step

### Plan 3 — Align direct execution [feature]

Rewrite `/fix` + build agent; mark swarm routing dormant.

**Metadata:**

```yaml
depends_on: ["Plan 2 — Prompt fidelity and lean context"]
parallel: false
conflicts_with: []
files:
  - .opencode/command/fix.md
  - .opencode/agent/build.md
  - .opencode/workflows/batch-implement.md
  - .opencode/workflows/development-lifecycle-workflow.md
  - .opencode/README.md
```

**Verification:**

- `rg -n 'batch-implement|5 parallel|Wave-Based|per-task commit' .opencode/command/{ship,fix}.md .opencode/agent/build.md` → no active routing
- `/ship` smoke with no `.opencode/artifacts/.active` accepts a direct request

### Plan 4 — Effective permission boundaries [feature]

Least-privilege effective agent permissions; specialists read-only, no recursive task.

**Metadata:**

```yaml
depends_on: ["Plan 3 — Align direct execution"]
parallel: false
conflicts_with: []
files:
  - .opencode/opencode.json
  - .opencode/agent/plan.md
  - .opencode/agent/general.md
  - .opencode/agent/explore.md
  - .opencode/agent/review.md
  - .opencode/agent/scout.md
```

**Verification:**

- `opencode debug config --pure` parses
- For general/explore/review/scout: `tools.apply_patch === false && tools.task === false` via `opencode debug agent <name> --pure`

---

## Notes

- Executable detail lives in `.opencode/artifacts/template-harness-v2/plan.md`.
- Plan 1 changes are in the working tree (uncommitted); commit is gated behind approval.
- Removing plugins requires an opencode restart to take effect (auto-discovered at startup).
