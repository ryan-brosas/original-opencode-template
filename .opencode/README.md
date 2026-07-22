# OpenCodeKit Template Configuration

This directory contains project-specific OpenCode configuration: agents, commands, skills, tools, plugins, and templates.

## Layout

```text
.opencode/
├── AGENTS.md                # Operating rules for agents (~110 lines, acts as map)
├── opencode.json            # OpenCode runtime configuration
├── dcp.jsonc                # Dynamic context pruning settings
├── QUALITY.md               # Quality grades per domain (graded by /gc)
├── agent/                   # Agent definitions (7)
├── command/                 # Slash commands (9 — includes /gc, /init)
├── artifacts/               # Session artifacts, memory, plans
├── skill/                   # Skill library used by agents/commands
├── tool/                    # Custom tools (structural-check.sh, etc.)
├── plugin/                  # OpenCode plugins and plugin-local SDK code
├── workflows/               # Multi-agent orchestration plans (5 — includes garbage-collection)
├── templates/               # Format templates (PRD, design, ADR, tasks, etc.)
└── .env.example             # Environment variable template
```

## Quick Setup

```bash
cp .opencode/.env.example .opencode/.env
```

Add the keys you actually need for enabled services.

## Agent and Command Workflow

- Spec-first flow: `/create` -> `/ship` (or `/ship` with a direct request)
- Use `/plan` optionally for deeper implementation planning

## Skills

Skills live in `.opencode/skill/` and are loaded on demand with `skill({ name: "..." })`. They follow a 3-tier system (see `manifest.json`):

**Tier 1 — Essential** — Always consider first; general-purpose execution discipline.
- `behavioral-kernel`, `defense-in-depth`, `incremental-implementation`, `verification-before-completion`

**Tier 2 — On-Demand** — Load when the task domain matches:
- *UI/design*: `frontend-design`, `design-taste-frontend`, `minimalist-ui`, `high-end-visual-design`, `industrial-brutalist-ui`, `accessibility-audit`, `redesign-existing-projects`, `mockup-to-code`
- *Testing*: `test-driven-development`, `testing-anti-patterns`, `browser-testing-with-devtools`, `playwright`
- *Debugging*: `debugging-and-error-recovery`, `root-cause-tracing`, `defense-in-depth`, `fallow`
- *Workflow*: `spec-driven-development`, `planning-and-task-breakdown`, `subagent-driven-development`, `development-lifecycle`, `git-workflow-and-versioning`, `shipping-and-launch`
- *Code quality*: `code-review-and-quality`, `agent-code-quality-gate`, `code-cleanup`, `deep-module-design`
- *Platform*: `supabase`, `resend`, `polar`, `cloudflare`*, `jira`, `figma`, `vercel-deploy-claimable`
- *Docs/design*: `documentation-and-adrs`, `deprecation-and-migration`, `api-and-interface-design`, `brainstorming`, `grill-me`
- *Research*: `opensrc`, `webclaw`, `pdf-extract`, `gemini-large-context`
- *Navigation*: `lsp` (workspaceSymbol), `grep`, `glob`
- *Etc*: `ci-cd-and-automation`, `security-and-hardening`, `performance-optimization`, `source-driven-development`, `writing-skills`

**Tier 3 — Platform Reference** — Large reference directories (not shipped by default). Install on demand:

```
.opencode/scripts/install-skill.sh <name>
```

\* `cloudflare` is tier-3 (257 files), listed here for discoverability. Run `install-skill.sh` to install.

## Custom Tools

Tools in `.opencode/tool/` are loaded by OpenCode and available to agents.

- Context: `rg -n "topic" .opencode/artifacts/MEMORY.md` for prior decisions, patterns, gotchas
- External research/docs: `context7`, `grepsearch`

## Plugins

Current plugin source files in `.opencode/plugin/`:

- `diagnostics.ts` - post-edit diagnostics auto-injection (type/lint/slop) + on-demand `diagnostics` tool
- `guard.ts` - safety guardrails (pipe-to-shell, commit message format)
- `skill-mcp.ts` - bridge for skill-scoped MCP servers/tools

Memory is file-based in `.opencode/artifacts/MEMORY.md` (grep/read/edit, no DB).

See `.opencode/plugin/README.md` for plugin details.

## Workflows

Workflows live in `.opencode/workflows/` and define reusable multi-agent orchestration plans. Each is a markdown file that specifies phases with agent types, concurrency, dependencies, and prompt templates.

**Built-in workflows:**
- `deep-research` — Fan out 8 search agents, cross-check findings, synthesize a cited report
- `audit-pattern` — Discover code pattern occurrences, audit each, produce remediation report
- `batch-implement` — **DORMANT** (parallel writers; `/ship` is linear single-writer now)
- `development-lifecycle-workflow` — **DORMANT** (composes batch-implement)
- `garbage-collection` — Fallow analysis → quality grading → cleanup PRs

**Usage:**
1. Read the workflow file from `.opencode/workflows/<name>.md`
2. Execute each phase via `task()` with the specified agent type and prompt
3. For parallel phases, spawn multiple `task()` calls concurrently
4. Replace `{phase_N_output}` placeholders with actual output from completed phases

New workflows: add a `.md` file to `.opencode/workflows/` following the same structure. See `AGENTS.md` for execution details.

## Commands

| Command | Description | Agent |
|---|---|---|
| `/init` | Initialize AGENTS.md, planning context, tech stack | build |
| `/create` | Create spec, workspace, and tasks | build |
| `/plan` | Detailed implementation plan | plan |
| `/ship` | Implement a change or plan, verify it, report evidence | build |
| `/verify` | Run the deterministic offline verifier and report results | review |
| `/research` | External research | scout |
| `/fix` | Fix a bug | build |
| `/audit` | Codebase pattern audit | review |
| `/gc` | Run garbage collection (Fallow + quality grading) | build |

## Architecture Enforcement

The template enforces a layered architecture (documented in `.opencode/artifacts/MEMORY.md`) with:

- **Plugin isolation** — plugins cannot import each other; types are shared via SDK
- **File size limits** — plugins ≤300 lines, SDK ≤150 lines, commands ≤500 lines
- **Filename convention** — kebab-case only
- **Structural check** — `.opencode/tool/structural-check.sh` runs during `/verify`

Run the structural check directly:
```bash
.opencode/tool/structural-check.sh
```

## Quality Management

- `.opencode/QUALITY.md` tracks grades per domain (Plugins, Commands, Skills, Docs, Workflows)
- Run `/gc` to scan with Fallow, grade each domain, and open cleanup PRs
- Quality grades are A (clean) through D (significant decay)

## Guardrails

- Keep edits focused; avoid changing generated output under `dist/`.
- Never commit `.env` values or credentials.
- Prefer tool-based file operations over shell text manipulation in agent workflows.
- Use `br` commands to track multi-session work and keep bead state accurate.

## Verification Baseline

```bash
# Deterministic offline verifier (exits 1 on failure)
bash .opencode/tool/verify.sh

# Structural invariants only (exits 1 on failure)
bash .opencode/tool/structural-check.sh

# Formatter (on demand)
npx oxfmt <file>
```

No `npm run` scripts exist (`package.json` has none). `tsc` is unavailable (`typescript` is not a dependency).
