# OpenCode Plugins

Plugins in this directory extend OpenCode with project-specific behavior and tools.
OpenCode auto-discovers every `.ts` file in this directory as a plugin.

## Current Plugin Files

```text
plugin/
├── diagnostics.ts      # Post-edit diagnostics auto-injection (type/lint/slop)
├── diagnostics/        # diagnostics helper modules
├── guard.ts            # Safety guardrails (pipe-to-shell, commit format)
├── skill-mcp.ts        # Skill-scoped MCP bridge (skill_mcp tools)
└── skill-mcp/          # skill-mcp helper modules
```

## Plugin Responsibilities

- `diagnostics.ts` + `diagnostics/`
  - **Barrel plugin** — entry point is `diagnostics.ts` (≤300 lines per architecture rule)
  - Helper modules in `diagnostics/`
  - Runs code diagnostics (type errors, lint, AI-slop) via `tool.execute.after` on write/edit
  - Exposes the `diagnostics` tool for on-demand checks

- `guard.ts`
  - Safety guardrails: blocks pipe-to-shell (`| sh`) and enforces commit message format

- `skill-mcp.ts` + `skill-mcp/`
  - Loads MCP configs from skills
  - Exposes `skill_mcp`, `skill_mcp_status`, `skill_mcp_disconnect`
  - Supports tool filtering with `includeTools`

## Notes

- OpenCode auto-discovers every `.ts` file in `plugin/` as a plugin — keep helper modules in per-plugin subdirectories (e.g. `diagnostics/`)
- Keep plugin documentation aligned with actual files in this directory
- Plugin isolation: plugins import the SDK only — never each other (enforced by `structural-check.sh`)
- Prefer shared helpers in per-plugin directories over duplicated utilities across plugins

## References

- OpenCode plugin docs: https://opencode.ai/docs/plugins/
- OpenCode custom tools docs: https://opencode.ai/docs/custom-tools/
