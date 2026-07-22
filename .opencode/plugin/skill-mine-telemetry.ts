/**
 * Skill-Mine Telemetry Plugin — passive usage observer.
 *
 * Appends a single `{skill, sessionID, timestamp}` record to the ignored
 * runtime log (`<runtimeRoot>/usage.jsonl`, 0600) whenever the native `skill`
 * tool executes. Records no prompts, skill content, or tool output.
 *
 * Self-contained per the plugin-isolation invariant: reads the runtimeRoot
 * from `.opencode/skill-mine.json` with a minimal inline parse (no import from
 * tool/). If the config is absent or malformed, falls back to the default
 * `.opencode/.skill-mine` root.
 *
 * Passive: every observer branch is wrapped so a failure here can never break
 * the tool call it observes. Telemetry is best-effort; correctness lives in the
 * deterministic core (`tool/skill-mine/usage.ts`).
 */

import type { Plugin } from "@opencode-ai/plugin";
import { appendFileSync, chmodSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const DEFAULT_RUNTIME_ROOT = ".opencode/.skill-mine";
const USAGE_FILE = "usage.jsonl";
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

function readRuntimeRoot(base: string): string {
  const configPath = join(base, ".opencode", "skill-mine.json");
  try {
    if (existsSync(configPath)) {
      const cfg = JSON.parse(readFileSync(configPath, "utf8")) as { runtimeRoot?: unknown };
      if (typeof cfg.runtimeRoot === "string" && cfg.runtimeRoot.length > 0) {
        return resolve(base, cfg.runtimeRoot);
      }
    }
  } catch {
    // fall through to default
  }
  return resolve(base, DEFAULT_RUNTIME_ROOT);
}

export const SkillMineTelemetryPlugin: Plugin = async ({ directory, worktree }) => {
  const base = worktree || directory;
  const usagePath = join(readRuntimeRoot(base), USAGE_FILE);

  return {
    "tool.execute.after": async (input) => {
      try {
        if (input.tool !== "skill") return;
        const args = (input.args ?? {}) as Record<string, unknown>;
        const skill = args.name;
        if (typeof skill !== "string" || skill.length === 0 || !NAME_RE.test(skill)) return;
        const sessionID = input.sessionID;
        if (typeof sessionID !== "string" || sessionID.length === 0) return;
        const line = JSON.stringify({ skill, sessionID, timestamp: Date.now() });
        appendFileSync(usagePath, line + "\n");
        chmodSync(usagePath, 0o600);
      } catch {
        // passive observer: never break the observed tool call
      }
    },
  };
};

export default SkillMineTelemetryPlugin;
