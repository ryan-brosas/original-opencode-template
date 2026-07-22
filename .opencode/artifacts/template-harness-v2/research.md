# Research Findings

<!-- External research for this feature. -->

Deep research conducted 2026-07-22 (6 parallel scout/explore/review angles).
Full evidence base is persisted in `.opencode/artifacts/template-harness-v2/plan.md`
(Evidence base section) and the MEMORY.md decision dated 2026-07-22.

## Key sources (cited in plan.md)

- Agentless (arXiv 2407.01489) — linear `localize→repair→validate` beats complex agents.
- AdaMAST (arXiv 2607.16387) + DISC (arXiv 2606.21724) — structured verification/failure-taxonomy beats free-form self-reflection.
- Token-Reduction-Is-Not-Cost-Reduction (arXiv 2607.12161) — preserve edit anchors; token reduction ≠ cost reduction.
- Lost-in-the-middle (arXiv 2307.03172) + LongLLMLingua (arXiv 2310.06839) — short instructions + selective retrieval + phase compaction.
- MemGPT/Letta (arXiv 2310.08560 + docs.letta.com) — file-based memory beats vector/graph for small auditable state.
- Anthropic context-engineering blog + claude.com/blog/context-management — phase-boundary compaction, not every-turn injection.
- OpenCode docs (config/agents/plugins/permissions/cli, 2026-07-21) — `instructions`, per-agent `permission`/`steps`/`hidden`, hooks, `compaction.tail_turns`, session export/import cover these without new infra.

## Conclusion

Minimal verifier-centered harness: one linear loop, one truthful verifier, one writer,
bounded read-only specialists, prompt fidelity. Avoid default swarms, vector memory,
auto-ingest, heavy telemetry.
