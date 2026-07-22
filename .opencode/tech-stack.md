---
purpose: Tech stack, constraints, and integrations for AI context injection
updated: 2026-07-22
---

# Tech Stack

This file is the detailed tech-stack map (read on demand). The concise project map at root `AGENTS.md` is auto-injected via `opencode.json` → `instructions[]`; `.opencode/AGENTS.md` (behavioral kernel) loads natively as the project `AGENTS.md`. Detected by `/init --deep` on 2026-07-22.

## Framework & Language

- **Framework:** OpenCode plugin SDK — `@opencode-ai/plugin@1.18.4` (template version `0.24.0`)
- **Language:** TypeScript (ES2022, ESNext modules, bundler resolution, `strict: false`, Bun types)
- **Runtime:** Bun 1.3.14 (Node via npx)
- **Package manager:** npm (package-lock.json; no `scripts` defined; devDeps tracked: `typescript@7.0.2`, `@types/bun@1.3.14`, `@types/node@24.12.2`)

## Styling & UI

- **N/A** — this project is a CLI/agent-configuration template, not a UI app.

## Data & State

- **Database:** none
- **ORM:** none
- **State:** file-based — `.opencode/artifacts/MEMORY.md` is the durable context store (grep/read/edit, no DB)
- **API Style:** plugins expose tools via the `@opencode-ai/plugin` SDK `tool()` helper

## Testing

- **Unit Tests:** none configured — `tsconfig.json` excludes `**/*.test.ts`; no test runner dependency
- **E2E Tests:** none
- **Coverage Target:** N/A
- **Verification:** `bash .opencode/tool/verify.sh` (deterministic offline runner; exits 1 on failure) or `bash .opencode/tool/structural-check.sh` (structural invariants only; exits 1 on failure)
- **Typecheck regression:** `bash .opencode/tool/verify-typecheck-test.sh` (isolated fixtures; covers PASS/FAIL/SKIP)

## Key Constraints

- Plugin isolation: plugins import SDK only — never each other. Shared types → `plugin/sdk/` (not yet on disk).
- File size limits: plugins ≤300 lines, SDK ≤150, commands ≤500, workflows ≤150.
- Filename convention: kebab-case only.
- `typescript` is a devDependency (7.0.2, exact); semantic typecheck runs via `verify.sh` using the pinned local `.opencode/node_modules/.bin/tsc`. Consumer templates ship the manifest — run `npm ci --prefix .opencode` to enable the typecheck (without the compiler installed, `verify.sh` SKIPs Check 4/5 with an install hint).
- Never edit `template/` (untracked reference copy) or generated `dist/`.
- **Repo boundary:** config `permission.external_directory: "deny"` (locked by `structural-check.sh` Check 7). An optional Linux-only bubblewrap sandbox (`.opencode/tool/opencode-sandbox.sh`) adds runtime filesystem containment — opt-in, fail-closed, normal checkouts only, network shared, secrets not isolated. See `.opencode/README.md` → Repo Boundary Sandbox.

## Active Integrations

- **External plugins (opencode.json → plugin):** `@tarquinen/opencode-dcp@latest`, `openslimedit@latest`
- **MCP servers (opencode.json → mcp):** `webclaw` (enabled), `figma-mcp-go` (disabled)
- **Provider:** Makora (`zai-org/GLM-5.2-NVFP4`) + OpenAI models; default `openai/gpt-5.6-sol-fast`

## Context Budget Guidelines

**Quality Degradation Rule:** Target ~50% context per plan execution for consistent quality.

| Task Complexity | Max Tasks/Plan | Typical Context Usage |
| --------------- | -------------- | --------------------- |
| Simple (CRUD)   | 3              | ~30-45%               |
| Complex (auth)  | 2              | ~40-50%               |
| Very complex    | 1-2            | ~30-50%               |

**Split Signals:**

- More than 3 tasks → Create child plans
- Multiple subsystems → Separate plans
- > 5 file modifications per task → Split
- Discovery + implementation → Split

## Verification Commands

**Always run before claiming complete:**

```bash
# Deterministic offline verification (exits 1 on failure)
bash .opencode/tool/verify.sh

# Structural invariants only (exits 1 on failure)
bash .opencode/tool/structural-check.sh

# Formatter (on demand)
npx oxfmt <file>

# Semantic typecheck (pinned local compiler)
.opencode/node_modules/.bin/tsc --noEmit -p .opencode/tsconfig.json

# Typecheck gate regression test (isolated fixtures)
bash .opencode/tool/verify-typecheck-test.sh
```

---

_Update this file when tech stack or constraints change._
_AI captures architecture, conventions, and gotchas in `.opencode/artifacts/MEMORY.md` as it works._
