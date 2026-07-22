import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RepoBoundaryPlugin — liveness/mislaunch DETECTOR (NOT a security boundary).
//
// Empirically (throw-swallow experiment, Plan 01 Task 3): opencode SWALLOWS
// plugin factory throws (logs `level=ERROR "failed to load plugin"` and
// CONTINUES). Per plan.md:74 the guard is therefore WARNING-based, never
// fail-closed. The bubblewrap launcher (Task 2) is the containment guarantee;
// the plugin only detects whether its forgeable marker is consistent with a
// wrapper launch.
//
// This test is behavior-based: it exercises the `default` factory with a mock
// client and asserts (a) stderr content on not-ok cases, (b) the `chat.message`
// hook fires a single best-effort TUI toast (variant "warning") on not-ok cases
// and stays silent on ok, (c) the toast is idempotent. It does NOT import the
// private `checkLiveness` (opencode auto-discovers named function exports as
// plugin factories — keeping the checker private is the fix for that bug).
//
// Non-literal dynamic import path: `bun build` (verify.sh Check 3) cannot
// statically resolve it, so this file COMPILES even when the plugin is absent
// (RED is a runtime import rejection, not a compile failure). tsc (Check 4)
// excludes `**/*.test.ts`, so this file is never typechecked.

const PLUGIN_MODULE = "../../plugin/repo-boundary.js";

type Factory = (input: {
  directory: string;
  worktree: string;
  client: { tui: { showToast: (opts: unknown) => Promise<unknown> } };
}) => Promise<{ "chat.message"?: (input: unknown, output: unknown) => Promise<void> }>;

let factory: Factory | undefined;
async function load(): Promise<Factory> {
  if (!factory) factory = (await import(PLUGIN_MODULE)).default as Factory;
  return factory;
}

const ORIG_ROOT = process.env.OPENCODE_SANDBOX_ROOT;
const ORIG_WRITE = process.stderr.write.bind(process.stderr);
let stderrBuf = "";
let dirs: string[] = [];
let toastCalls: unknown[] = [];

function mockClient(): { tui: { showToast: (opts: unknown) => Promise<unknown> } } {
  toastCalls = [];
  return {
    tui: {
      showToast: async (opts: unknown) => {
        toastCalls.push(opts);
        return {};
      },
    },
  };
}

function tmpDir(): string {
  const d = mkdtempSync(join(tmpdir(), "rb-plugin-"));
  dirs.push(d);
  return d;
}

async function run(directory: string, worktree: string) {
  const f = await load();
  return f({ directory, worktree, client: mockClient() });
}

beforeEach(() => {
  stderrBuf = "";
  toastCalls = [];
  (process.stderr as { write: (s: string) => boolean }).write = (s: string) => {
    stderrBuf += s;
    return true;
  };
});

afterEach(() => {
  (process.stderr as { write: typeof ORIG_WRITE }).write = ORIG_WRITE;
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
  if (ORIG_ROOT === undefined) delete process.env.OPENCODE_SANDBOX_ROOT;
  else process.env.OPENCODE_SANDBOX_ROOT = ORIG_ROOT;
});

describe("RepoBoundaryPlugin (liveness detector — warn, never throw)", () => {
  test("marker absent -> stderr warns + toast on first chat.message + no throw", async () => {
    delete process.env.OPENCODE_SANDBOX_ROOT;
    const d = tmpDir();
    const hooks = await run(d, d);
    expect(hooks).toBeDefined();
    expect(stderrBuf.toLowerCase()).toContain("repo-boundary");
    expect(stderrBuf.toLowerCase()).toContain("warn");
    const cm = hooks["chat.message"];
    expect(typeof cm).toBe("function");
    await cm({}, {});
    expect(toastCalls.length).toBe(1);
    expect(JSON.stringify(toastCalls[0])).toContain("warning");
  });

  test("marker empty -> warns marker-absent + toast", async () => {
    process.env.OPENCODE_SANDBOX_ROOT = "";
    const d = tmpDir();
    const hooks = await run(d, d);
    expect(stderrBuf.toLowerCase()).toContain("marker absent");
    const cm = hooks["chat.message"];
    if (typeof cm === "function") await cm({}, {});
    expect(toastCalls.length).toBe(1);
  });

  test("marker present + match -> silent (no stderr, no toast)", async () => {
    const d = tmpDir();
    process.env.OPENCODE_SANDBOX_ROOT = d;
    const hooks = await run(d, d);
    expect(stderrBuf).toBe("");
    const cm = hooks["chat.message"];
    if (typeof cm === "function") await cm({}, {});
    expect(toastCalls.length).toBe(0);
  });

  test("marker present + directory mismatch -> warns mismatch + toast", async () => {
    const root = tmpDir();
    const other = tmpDir();
    process.env.OPENCODE_SANDBOX_ROOT = root;
    const hooks = await run(other, other);
    expect(stderrBuf.toLowerCase()).toContain("mismatch");
    const cm = hooks["chat.message"];
    if (typeof cm === "function") await cm({}, {});
    expect(toastCalls.length).toBe(1);
  });

  test("marker present + worktree widens -> warns worktree + toast", async () => {
    const d = tmpDir();
    const wt = tmpDir();
    process.env.OPENCODE_SANDBOX_ROOT = d;
    const hooks = await run(d, wt);
    expect(stderrBuf.toLowerCase()).toContain("worktree");
    const cm = hooks["chat.message"];
    if (typeof cm === "function") await cm({}, {});
    expect(toastCalls.length).toBe(1);
  });

  test("unresolvable path -> warns + toast", async () => {
    process.env.OPENCODE_SANDBOX_ROOT = "/no/such/path/here";
    const hooks = await run("/no/such/path/here", "/no/such/path/here");
    expect(stderrBuf.toLowerCase()).toContain("resolve");
    const cm = hooks["chat.message"];
    if (typeof cm === "function") await cm({}, {});
    expect(toastCalls.length).toBe(1);
  });

  test("toast fires at most once across multiple chat.message events (idempotent)", async () => {
    delete process.env.OPENCODE_SANDBOX_ROOT;
    const d = tmpDir();
    const hooks = await run(d, d);
    const cm = hooks["chat.message"];
    if (typeof cm === "function") {
      await cm({}, {});
      await cm({}, {});
      await cm({}, {});
    }
    expect(toastCalls.length).toBe(1);
  });
});
