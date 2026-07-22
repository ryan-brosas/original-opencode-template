# OpenCode Template — Project Guide

This repo IS the OpenCode template/configuration. Real code lives in `.opencode/` (plugins + tools on the `@opencode-ai/plugin` SDK). `.opencode/AGENTS.md` is the behavioral kernel; this file is the tech-stack/structure map.

## Stack
- **Language:** TypeScript — ES2022, ESNext, bundler resolution, `strict: false`, Bun types (`tsconfig.json`)
- **Runtime:** Bun 1.3.14 (Node via npx)
- **Package manager:** npm — sole dep `@opencode-ai/plugin@1.18.4`; template version `0.24.0` (`.opencode/.version`)
- **Formatter:** `npx oxfmt $FILE` — `.ts/.tsx/.js/.jsx/.json/.jsonc/.cjs/.mjs/.mts`
- **LSP:** enabled (`opencode.json`)

## Layout (code; full map in `.opencode/README.md`)
```
.opencode/
├── plugin/    TS plugins: diagnostics, skill-mcp, guard
├── tool/      agent tools: context7.ts, grepsearch.ts, structural-check.sh
├── command/   slash commands (md): build, ship, plan, verify, gc, fix, audit, research, create
├── agent/     agent definitions (md): build, plan, review, explore, scout, general, vision
├── workflows/ orchestration plans (md): deep-research, batch-implement, audit-pattern, ...
├── skill/     skill library (SKILL.md + JS helpers, ~67 skills)
└── artifacts/ MEMORY.md, plans, todos
```
`template/` (untracked) is a near-identical reference copy of `.opencode/` — don't edit it.

## Commands (validated)
| Command | Status |
|---|---|
| `bun <file>` | works (1.3.14) |
| `bash .opencode/tool/structural-check.sh` | works — enforces plugin isolation + file limits (exits 1 on failure) |
| `bash .opencode/tool/verify.sh` | works — deterministic offline verifier (config, structural, compile smoke, diff) |
| `npx oxfmt <file>` | formatter (on demand) |
| `npx tsc --noEmit` | **broken** — `typescript` is not a dependency |
| `npm run …` | **none** — `package.json` has no `scripts` |
| CI/CD | none |

## Plugin pattern (`.opencode/plugin/diagnostics.ts`)
```ts
import { type Plugin, tool } from "@opencode-ai/plugin";
export const DiagnosticsPlugin: Plugin = async ({ directory, worktree }) => ({
  tool: {
    diagnostics: tool({
      description: "Run code diagnostics...",
      args: { scope: tool.schema.enum(["full", "changed"]).optional() /* ... */ },
      async execute(args, ctx) { /* ... */ return { output: text }; },
    }),
  },
  "tool.execute.after": async (input, output) => { /* event hook after write/edit */ },
});
export default DiagnosticsPlugin;
```
Local plugins live in `.opencode/plugin/*.ts` (default-export a `Plugin`). External npm plugins are listed in `opencode.json` → `plugin` (currently `@tarquinen/opencode-dcp`, `openslimedit`). Args use `tool.schema.*`; handlers return `{ output }`. TS imports use `.js` extensions (e.g. `./diagnostics/params.js`) — Bun/ESM convention.

## Boundaries (enforced by `structural-check.sh`; model in `.opencode/artifacts/MEMORY.md`)
- **Plugin isolation:** plugins import SDK only — never each other. Shared types belong in `plugin/sdk/` (designated home; not yet created on disk).
- **File limits:** plugins ≤300 lines, SDK ≤150, commands ≤500, workflows ≤150.
- **Naming:** kebab-case filenames only.

## Conventions
- **Verify after plugin/tool edits:** run `verify.sh` (full) or `structural-check.sh` (invariants); both exit 1 on failure. No typecheck or test suite out of the box.
- **Durable context:** `rg -n "topic" .opencode/artifacts/MEMORY.md` before work; append decisions there.
- **Edit protocol / delegation / search:** see `.opencode/AGENTS.md` (behavioral kernel).

## Gotchas
- `npx tsc` prints a stub ("not the tsc you are looking for") — `typescript` isn't installed; a 0 exit is meaningless.
- `structural-check.sh` exits 1 on failure; the PASS-after-FAIL size bug is fixed (size section now guards its pass). `verify.sh` aggregates all checks.
- `plugin/sdk/` is referenced by the architecture but **does not exist yet** — create it when extracting shared types.
- `command/ship.md` is 502 lines (over the 500 limit) — known, pre-existing.
