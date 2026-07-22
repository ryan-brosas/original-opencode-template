---
description: Debug and fix a bug or failing test
argument-hint: "<description of bug or error>"
agent: build
---

# Fix: $ARGUMENTS

Systematically debug and fix the reported issue using the same loop as `/ship`:
**reproduce → localize → patch → verify → evidence**. You are the sole writer.

## Load Skills

```typescript
skill({ name: "root-cause-tracing" });
skill({ name: "verification-before-completion" });
```

## The Loop

### 1. Reproduce

Reproduce the issue with the exact steps or command that triggered it. If you
can't reproduce it, say so — a fix without a reproduction is a guess.

### 2. Localize

- Search for the error message or symptom: `rg -n` / `grep`.
- Trace the execution path to the root cause — read 2–4 most-relevant files fresh.
- Distinguish symptom from root cause. State the root cause in one sentence with
  `file:line`. If it's a mapping problem, surface it before patching.

### 3. Patch

Apply the minimal fix for the root cause. Prefer making the bad state impossible
over handling all bad states. Do not add speculative guards, tolerant readers, or
defensive copies. Surgical diffs only — every line traces to the fix.

### 4. Verify

Run the base gate, then the task-specific check.

**Base gate (always):**

```bash
bash .opencode/tool/verify.sh
```

**Task-specific check:** run the command that proves the bug is gone — the
project's test/lint/typecheck, a `bun <file>` smoke, or the exact reproduction
steps. Do not invent `npm run` commands that don't exist. If the project has no
test suite, run the closest useful check and name the gap.

If verification fails twice on the same approach, stop. Preserve evidence, report
the blocker. Do not endlessly retry.

### 5. Evidence

```text
## Fixed: <one-line summary>
Root cause: path/to/file.ts:42 — <what was wrong>
Fix: <what changed>
Commands: `bash .opencode/tool/verify.sh` (exit 0), <task-specific check> (exit 0)
Result: PASS — bug no longer reproduces
```

## Output

1. **Root cause** (with `file:line`)
2. **Fix applied** (what changed, why)
3. **Verification results** (command + exit code)
4. **What else was considered and rejected**

## Related Commands

| Need | Command |
| ---- | ------- |
| Run only verification | `/verify` |
| Ship a feature | `/ship` |
