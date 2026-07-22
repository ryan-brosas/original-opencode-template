---
description: Implement a change or plan, verify it, and report evidence
agent: build
---

# Ship: $ARGUMENTS

Execute a change with one linear loop: **localize → patch → verify → evidence**.
You are the sole writer. No waves, no parallel writer fan-out, no mandatory commits.

## Load Skills

```typescript
skill({ name: "verification-before-completion" });
```

## Input

Accept either:

- **A direct request** — the `$ARGUMENTS` describe what to change. Start immediately.
- **An existing plan** — if `.opencode/artifacts/<slug>/plan.md` exists, read it for
  context, but you are not bound to its task structure; ship the change itself.

You do **not** require `.opencode/artifacts/.active` or a spec. A direct request is
enough.

## The Loop

### 1. Localize

Find the exact code that must change — before editing.

- Search narrowly: `rg -n` / `grep` / `glob` / LSP `findReferences`.
- Read 1–4 most-relevant files fresh (never edit from memory).
- Check prior decisions: `rg -n "topic" .opencode/artifacts/MEMORY.md`.
- State the root cause or target in one sentence. If the problem is a mapping
  problem, surface it before patching.

### 2. Patch

Make the smallest change that satisfies the request. Surgical diffs only — every
line traces to the request. Match existing style. Remove imports/vars your
change made unused. Unrelated issues get `NOTICED BUT NOT TOUCHING: ...`.

You are the **only writer**. Do not dispatch implementation subagents (`task` with
`general`); do direct edits. Delegate only read-only `explore`/`scout`/`review`
when isolation or specialist focus genuinely helps — never for writing.

### 3. Verify

Run the base gate, then the exact task-specific check.

**Base gate (always):**

```bash
bash .opencode/tool/verify.sh
```

This is deterministic and offline: config validation, structural invariants, Bun
compile smoke, `git diff --check`. Exit 1 = not done.

**Task-specific check:** run the real command the change implies (the project's
test/lint/typecheck, a smoke `bun <file>`, a `git diff --check`, or a manual
behavior check). Do not invent `npm run` commands that don't exist — if the
project has no test suite, run the closest useful check and name the gap.

If verification fails twice on the same approach, stop. Preserve evidence, report
the blocker, present options. Do not endlessly retry.

### 4. Evidence

Record a compact, replayable evidence block:

```text
## Shipped: <one-line summary>
Changed: path/to/file.ts:42, path/other.md:8
Commands: `bash .opencode/tool/verify.sh` (exit 0), `bun tool/x.ts` (exit 0)
Result: PASS — all gates green
Risks: <none | specific untested path>
```

If an active plan artifact exists (`.opencode/artifacts/<slug>/progress.md`),
append there; otherwise return it in your response.

## Optional Review (high-risk only)

For high-risk changes (security, auth, data migration, public API), spawn **one**
read-only review subagent after verify passes:

```typescript
task({
  subagent_type: "review",
  prompt: "Review this diff for correctness/security/regressions. Spec: <…>. Diff: <…>. Return: findings with file:line + confidence, and overall_correctness.",
});
```

Critical findings → fix inline, re-verify, continue. Architecture findings →
stop, present options to the user. Routine changes skip review.

## Goal-Backward Check (when a plan/spec exists)

Task completion ≠ goal achievement. For each goal the plan stated, confirm:

| Level | Check |
|-------|-------|
| Exists | the file/artifact is present |
| Substantive | real implementation, not a `TODO`/`return null`/placeholder |
| Wired | imported and used, not orphaned |

If any goal fails Level 2 or 3, fix and re-verify before claiming done.

## Stop Conditions

- Verify fails 2× on the same approach → stop, report blocker
- Scope grows beyond the request → stop, ask the user
- Architecture-level decision required → stop, present options
- Destructive/irreversible action → ask first

## Close

Ask the user before closing — `question({ questions: [{ header: "Close", question: "Verify passed, evidence recorded. Mark complete?", options: [{ label: "Yes (Recommended)" }, { label: "No, keep working" }] }] })`.

Commit and push are **never automatic** — `git commit`/`git push` are gated behind approval. Ask before committing; never run `git add .`.

## Output

1. **Summary**: one line — what changed and why
2. **Changed files**: `path:line` for each
3. **Verification**: command + exit code for base gate and task-specific check
4. **Review** (if run): findings count + overall correctness
5. **Risks**: untested paths or assumptions, or none
6. **Next step**: `/fix <issue>` if a check failed, or done

## Related Commands

| Need | Command |
| ---- | ------- |
| Plan first | `/plan` |
| Fix a failing check | `/fix <description>` |
| Run only verification | `/verify` |
| Research a dependency | `/research` |
