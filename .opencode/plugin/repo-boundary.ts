/**
 * RepoBoundaryPlugin — Liveness / mislaunch DETECTOR (NOT a security boundary).
 *
 * Role: detect whether opencode was launched inside the opencode-sandbox wrapper
 * (Plan 01 Task 2) by checking its liveness marker (`OPENCODE_SANDBOX_ROOT`,
 * set by the launcher) against opencode's own `directory`/`worktree`. The
 * bubblewrap launcher is the authoritative filesystem-containment boundary;
 * a matching (forgeable) marker proves only CONSISTENCY with a wrapper launch,
 * NOT actual containment.
 *
 * IMPORTANT — opencode SWALLOWS plugin factory throws. Empirically verified: a
 * factory throw is logged as `level=ERROR "failed to load plugin"` and opencode
 * CONTINUES startup (throw-swallow experiment, Plan 01 Task 3). Per plan.md:74,
 * the guard is therefore narrowed to a WARNING, never a fail-closed throw. It
 * must never block startup; the launcher's fail-closed behavior is the security
 * guarantee.
 *
 * Dual-channel warning (both best-effort):
 *  - stderr (immediate, in the factory): visible in headless `opencode run`,
 *    `--print-logs`, and log files.
 *  - TUI toast (fired from the `chat.message` hook on the first user message,
 *    by which point the TUI is guaranteed up): visible in the interactive TUI
 *    where factory-time stderr is overwritten by the next render. Fires at most
 *    once per process (idempotent). The call is wrapped in try/catch: a
 *    headless/no-TUI/failed launch silently skips it (stderr already logged it).
 *
 * Outcomes (all WARN-only, never throw):
 *  - marker present + canonical directory === root + worktree === directory:
 *    silent (consistent with a wrapper launch on the contained dir).
 *  - marker absent (or empty/whitespace): WARN — runtime containment NOT active.
 *  - marker present + directory !== root: WARN — mislaunch.
 *  - worktree !== directory: WARN — linked worktrees unsupported in V1.
 *  - unresolvable path: WARN — opencode reported a non-existent directory.
 */

import type { Plugin } from "@opencode-ai/plugin";
import { realpathSync } from "node:fs";

type LivenessResult =
  | { ok: true }
  | {
      ok: false;
      reason: "marker-absent" | "directory-mismatch" | "worktree-widened" | "unresolvable";
      message: string;
    };

// Private (not exported): opencode's auto-discovery invokes every runtime
// function export as a plugin factory, which would mis-wire a pure checker.
function checkLiveness(
  directory: string,
  worktree: string,
  marker: string | undefined,
): LivenessResult {
  if (!marker || marker.trim() === "") {
    return {
      ok: false,
      reason: "marker-absent",
      message:
        "[repo-boundary] WARNING: OPENCODE_SANDBOX_ROOT marker absent — opencode was not launched via opencode-sandbox; runtime filesystem containment is NOT active. Launch through the sandbox wrapper.",
    };
  }

  let dirC: string;
  let rootC: string;
  try {
    // realpathSync resolves symlinks to the physical path (matches the
    // launcher's `pwd -P` canonicalization) and throws ENOENT for non-existent.
    dirC = realpathSync(directory);
    rootC = realpathSync(marker);
  } catch {
    return {
      ok: false,
      reason: "unresolvable",
      message: `[repo-boundary] WARNING: a path does not resolve on disk (directory=${directory}, marker=${marker}). Possible mislaunch.`,
    };
  }

  if (dirC !== rootC) {
    return {
      ok: false,
      reason: "directory-mismatch",
      message: `[repo-boundary] WARNING: directory mismatch — sandbox root is ${rootC} but opencode opened ${dirC}. Mislaunch: the sandbox would not contain this directory.`,
    };
  }

  let wtC: string;
  try {
    wtC = realpathSync(worktree);
  } catch {
    return {
      ok: false,
      reason: "unresolvable",
      message: `[repo-boundary] WARNING: worktree does not resolve on disk (worktree=${worktree}).`,
    };
  }

  if (wtC !== dirC) {
    return {
      ok: false,
      reason: "worktree-widened",
      message: `[repo-boundary] WARNING: worktree (${wtC}) differs from directory (${dirC}) — linked worktrees are not supported in V1; the boundary would widen.`,
    };
  }

  return { ok: true };
}

// Module-level, idempotent across multiple factory loads / chat.message events.
let warningMessage: string | null = null;
let toasted = false;

export const RepoBoundaryPlugin: Plugin = async ({ directory, worktree, client }) => {
  // Reset per factory invocation: one opencode process = one factory call = one
  // toast budget. (Also makes the unit tests independent across invocations.)
  toasted = false;
  const result = checkLiveness(directory, worktree, process.env.OPENCODE_SANDBOX_ROOT);
  if (result.ok === false) {
    warningMessage = result.message;
    // Immediate stderr signal: visible in headless `opencode run` / --print-logs / logs.
    process.stderr.write(`\n${result.message}\n\n`);
  } else {
    warningMessage = null;
  }

  return {
    // Fires on the first user message, by which point the TUI is up. Avoids the
    // factory-time toast timing race. Best-effort: headless/no-TUI calls fail
    // the toast and are caught (stderr already logged the warning).
    "chat.message": async () => {
      if (warningMessage && !toasted) {
        toasted = true;
        try {
          await client.tui.showToast({
            body: { title: "repo-boundary", message: warningMessage, variant: "warning" },
          });
        } catch {
          // best-effort: no TUI / not ready / call shape mismatch -> stderr already logged it
        }
      }
    },
  };
};

export default RepoBoundaryPlugin;
