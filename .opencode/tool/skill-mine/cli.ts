#!/usr/bin/env bun
// Skill-Mine CLI — deterministic entry point.
//
//   bun .opencode/tool/skill-mine/cli.ts prepare         # reads ProvisionalInput JSON from stdin
//   bun .opencode/tool/skill-mine/cli.ts finalize <id>   # finalizes the provisional receipt
//   bun .opencode/tool/skill-mine/cli.ts capture <sha>   # sanitized capture of a finalized receipt
//   bun .opencode/tool/skill-mine/cli.ts distill <name>  # reads SKILL.md from stdin, writes candidate to quarantine
//   bun .opencode/tool/skill-mine/cli.ts evaluate <name> # reads ApprovalInput JSON from stdin, records behavioral approval
//
// Receipts are local (ignored runtime tree). The build agent calls `prepare`
// after verify + staging and `finalize` after a successful push.

import { join } from "node:path";
import { loadConfig, bootstrapRuntime } from "./config.js";
import { prepareReceipt, finalizeReceipt } from "./receipts.js";
import { capture } from "./capture.js";
import { writeCandidate } from "./candidate.js";
import { recordApproval } from "./evaluate.js";
import type { ProvisionalInput } from "./types.js";
import type { ApprovalInput } from "./evaluate.js";

const CONFIG_PATH = process.env.SKILL_MINE_CONFIG ?? ".opencode/skill-mine.json";

async function main(): Promise<number> {
  const [, , subcommand, ...rest] = process.argv;
  if (!subcommand) {
    console.error("usage: cli.ts <prepare|finalize|capture|distill|evaluate> [args]");
    return 2;
  }

  const cfg = loadConfig(CONFIG_PATH);
  bootstrapRuntime(cfg);

  switch (subcommand) {
    case "prepare": {
      const input = JSON.parse(await readStdin()) as ProvisionalInput;
      const prov = await prepareReceipt(input, cfg);
      console.log(prov.workUnitId);
      return 0;
    }
    case "finalize": {
      const workUnitId = rest[0];
      if (!workUnitId) {
        console.error("usage: cli.ts finalize <workUnitId>");
        return 2;
      }
      const fin = await finalizeReceipt(workUnitId, cfg);
      console.log(fin.commitSha);
      return 0;
    }
    case "capture": {
      const sha = rest[0];
      if (!sha) {
        console.error("usage: cli.ts capture <commitSha>");
        return 2;
      }
      const trace = await capture(sha, cfg);
      console.log(join(cfg.runtimeRoot, "traces", `${trace.commitSha}.json`));
      return 0;
    }
    case "distill": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts distill <candidateName>");
        return 2;
      }
      const skillMd = await readStdin();
      const dir = writeCandidate(cfg, name, skillMd);
      console.log(dir);
      return 0;
    }
    case "evaluate": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts evaluate <candidateName>");
        return 2;
      }
      const input = JSON.parse(await readStdin()) as ApprovalInput;
      input.candidateName = name;
      const record = recordApproval(input, cfg);
      console.log(approvalPathPrint(cfg, name));
      return 0;
    }
    default: {
      console.error(`unknown subcommand: ${subcommand}`);
      return 2;
    }
  }
}

function approvalPathPrint(cfg: { runtimeRoot: string }, name: string): string {
  return join(cfg.runtimeRoot, "candidates", name, "approval.json");
}

function readStdin(): Promise<string> {
  return new Response(Bun.stdin).text();
}

if (import.meta.main) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err.message);
      process.exit(1);
    });
}
