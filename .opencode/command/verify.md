---
description: Run the deterministic offline verifier and report results
argument-hint: "[--full]"
agent: review
---

# Verify: $ARGUMENTS

Run the offline verifier and report truthful, reproducible results.

## Load Skills

```typescript
skill({ name: "verification-before-completion" });
```

## What this command does

Invokes **one** deterministic runner and reports its structured output. No cache,
no auto-fix, no artifact prerequisites, no network.

```bash
bash .opencode/tool/verify.sh
```

## Checks performed (in order)

| # | Check | What it catches |
|---|-------|----------------|
| 1 | Config validation (`opencode debug config --pure`) | Invalid `opencode.json` — opencode hard-fails on bad config |
| 2 | Structural invariants (`structural-check.sh`) | Plugin isolation, file size limits, TODO hygiene, kebab-case, repo boundary (`external_directory` must be `deny`) |
| 3 | Bun compile smoke | Syntax + import-resolution errors in `plugin/*.ts` + `tool/*.ts` |
| 4 | TypeScript semantic typecheck | Semantic type errors via the pinned local `tsc`; SKIPs with an install hint when the compiler is absent (run `npm ci --prefix .opencode` to install) |
| 5 | `git diff --check` | Whitespace errors / conflict markers |

Exit 0 = no check failed (SKIPs do not count as failures). Exit 1 = one or more
failed — read the per-check FAIL lines.

## Behavior

- **Read-only.** You are the review agent. Do not edit, write, commit, or append
  to artifacts. Report the verifier output verbatim.
- **No cache.** Every run is fresh — the result reflects the current tree.
- **No guessing.** Do not invent gates the project lacks. If a project-specific
  check is needed (e.g. a real test suite), name it and let the user run it; do
  not fabricate `npm run` commands.
- **`--full`** is accepted but a no-op — verification is always full (the runner
  has no incremental mode).

## Output

1. **Result**: PASS / FAIL (from the runner's exit code)
2. **Per-check status**: paste the runner's structured output
3. **Failures**: list each FAIL with the check name and detail
4. **Next step**: if PASS → ready to ship/continue; if FAIL → name the specific
   fix needed (do not apply it — that is the build agent's job)

## Related Commands

| Need | Command |
| ---- | ------- |
| Ship after verify passes | `/ship` |
| Fix a failing check | `/fix <description>` |
| Plan a feature | `/plan` |
