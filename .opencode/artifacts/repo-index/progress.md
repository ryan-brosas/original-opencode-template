# Repo Index — Proof Gate + Decision

**Slug:** repo-index
**Created:** 2026-07-22
**Status:** Complete — DELETE (negative result)

## Methodology

Clean A/B, no cross-contamination: for each task, two **fresh** `explore`
subagents (independent contexts) ran the **same scope**:

- **Baseline** — bare "locate where X is implemented" prompt (today's agent; may
  read AGENTS.md on its own initiative, no index aid).
- **`/repo-index`** — the bounded-locator command body (entrypoints → direct
  modules/callers → recommended reads → omissions, ~40-line output budget).

Both reported an auditable `TOOL_CALLS` count, a verbatim `### TRACE` of every
tool call, and `WRONG_FILE_STARTS` (files opened that turned out unrelated to
the scope before finding the right ones). Fresh contexts ⇒ neither leg is
contaminated by the other, so same-scope comparison is valid.

**Conflict declared:** the author of this command also ran the proof gate and
made the keep/delete call. The stop conditions pre-commit the decision to the
data (below), which is unambiguous, so the call is data-driven, not opinion.

## Tasks (≥3, incl. this template + 2 consumers)

| # | Repo | Scope | Baseline calls | `/repo-index` calls | Δ calls | Baseline WFS | Index WFS |
|---|------|-------|---------------:|---------------------:|--------:|------------:|----------:|
| T | `/home/ryan/repo/opencode` (this template) | skill-mine promotion flow (promote subcommand → active root) | 13 | 20 | +7 | 0 | 0 |
| C1 | `/home/ryan/repo/personal-website` (consumer) | Astro Content Collections — config/schema/query/render | 12 | 29 | +17 | 0 | 0 |
| C2 | `/home/ryan/repo/portfolio-mastrabot` (consumer) | Mastra agent runtime — agents/factories/index/routes | 10 | 8 | −2 | 1 | 1 |
| | **Total** | | **35** | **57** | **+22** | **1** | **1** |

### Notes per task

- **T (template):** Baseline found the promote transaction in 13 calls with
  precise `path:line` (cli.ts:143-157 → lifecycle.ts:230-329 → candidate/evaluate/budget).
  `/repo-index` produced a richer map (also surfaced `skill-mine.md` command +
  `skill-mine.json` config + tests) but at +7 calls with **no** wrong-file
  starts to recover. AGENTS.md + one targeted grep already locates within the
  explore ≤3-calls/symbol budget — **stop condition #1 holds**.
- **C1 (personal-website):** Both reached the same finding (no live
  `blog`/`projects` render callers; only `pages` via sitemap.xml.ts).
  `/repo-index` over-searched (29 calls: 4 parallel glob batches + many greps)
  to fill its 4-section completeness contract. The bounded-*output* budget did
  **not** bound tool calls — the 4-section structure incentivized broader
  search, not narrower. **Stop condition #6 holds** (more broad searches, not
  fewer).
- **C2 (portfolio-mastrabot):** Only task where `/repo-index` was marginally
  cheaper (−2 calls). But the **same** wrong-file start (`src/index.ts` opened
  before finding `src/mastra/index.ts`) recurred in **both** legs — the
  locator's structure did **not** prevent it. No consumer showed a wrong-file
  start reduction. **Stop condition #5 holds** (no net consumer benefit).

## Stop-condition check (from spec §Stop Conditions)

| # | Condition | Holds? | Evidence |
|---|-----------|--------|----------|
| 1 | AGENTS.md + one targeted search locates within explore budget | YES | T: 13 calls, 0 WFS |
| 2 | No repeated wrong-file starts / localization bottleneck observed | YES | 1 WFS total across 6 runs |
| 3 | Output mostly repeats AGENTS.md/README/manifest | partial | richer, but richness ≠ turn reduction |
| 4 | Cannot stay bounded without omitting needed info | no | stayed bounded in output (over-searched instead) |
| 5 | Helps only this template, not ≥1 consumer | YES | C1 +17, C2 −2 calls, 0 WFS recovered |
| 6 | Agents still repeat broad searches (no net reduction) | YES | net +22 calls |
| 7 | Correctness requires behavioral summaries, not locators | n/a | both were locators |
| 8 | Requires auto-injection/embeddings/db/watcher/snapshot | n/a | neither required it |

**4 of 8 stop conditions hold** (#1, #2, #5, #6) — deletion is warranted on any
one of #1, #5, or #6 alone.

## Decision

**DELETE.** Do not ship `/repo-index`.

The bounded-output locator **increased** total localization turns (57 vs 35,
+22) and recovered **zero** wrong-file starts. The 4-section completeness
contract (entrypoints → callers → reads → omissions) drove **broader**
searching, not narrower, because the hard budget was on output lines, not on
tool calls. The existing `explore` agent + AGENTS.md already locates within
budget on this template, and consumers saw no net benefit. This is an honest
negative result: the command duplicated what `explore`/`zoom-out` + the
auto-injected `AGENTS.md` already do, just more expensively.

## What ships

- The command file (`.opencode/command/repo-index.md`) is **removed** — it was
  never committed.
- `AGENTS.md` and `.opencode/README.md` command-table edits are **reverted**
  (the command does not exist).
- This `progress.md` + `spec.md` + `prd.json` + `MEMORY.md`/`roadmap.md`/
  `state.md` notes remain as the experiment record.

## Open questions (resolved by the gate)

- **oq1 (useful scopes):** subsystem/symbol/task scopes were all tried; none
  produced a turn reduction. Scope choice did not change the outcome.
- **oq2 (proof-gate task set):** 3 tasks (this template + 2 consumers). Gate
  sufficient to decide.
- **oq3 (explore.md pointer):** moot — command deleted, no pointer added.
