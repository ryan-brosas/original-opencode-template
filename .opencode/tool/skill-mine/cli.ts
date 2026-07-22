#!/usr/bin/env bun
// Skill-Mine CLI — deterministic entry point.
//
//   bun .opencode/tool/skill-mine/cli.ts prepare         # reads ProvisionalInput JSON from stdin
//   bun .opencode/tool/skill-mine/cli.ts finalize <id>   # finalizes the provisional receipt
//   bun .opencode/tool/skill-mine/cli.ts capture <sha>   # sanitized capture of a finalized receipt
//   bun .opencode/tool/skill-mine/cli.ts distill <name>  # reads SKILL.md from stdin, writes candidate to quarantine
//   bun .opencode/tool/skill-mine/cli.ts evaluate <name> # reads ApprovalInput JSON from stdin, records behavioral approval
//   bun .opencode/tool/skill-mine/cli.ts retire <name>   # move a mined skill from its active root to the archive
//   bun .opencode/tool/skill-mine/cli.ts restore <name> # move an archived skill back to its original scope root
//   bun .opencode/tool/skill-mine/cli.ts recover <name> # recover/rollback a crashed retire or restore
//
//   bun .opencode/tool/skill-mine/cli.ts budget            # print catalog budget check (exit 1 if over)
//   bun .opencode/tool/skill-mine/cli.ts doctor            # print health-check report (exit 1 if unhealthy)
//   bun .opencode/tool/skill-mine/cli.ts validate <name>    # run admission checks on a quarantined candidate
//   bun .opencode/tool/skill-mine/cli.ts promote <name>    # promote a candidate to its active root (evidence JSON via stdin for template scope)
//   bun .opencode/tool/skill-mine/cli.ts rollback <name>   # move a promoted skill back to quarantine (after outer release failure)
//
// Receipts are local (ignored runtime tree). The build agent calls `prepare`
// after verify + staging and `finalize` after a successful push.

import { join } from "node:path";
import { loadConfig, bootstrapRuntime } from "./config.js";
import { prepareReceipt, finalizeReceipt } from "./receipts.js";
import { capture } from "./capture.js";
import { writeCandidate, candidateDir } from "./candidate.js";
import { validateCandidate } from "./candidate.js";
import { recordApproval } from "./evaluate.js";
import { retire, restore, recover, promote, rollbackPromote } from "./lifecycle.js";
import { checkBudget, scanMinedSkills } from "./budget.js";
import { appendUsage, usageReport, recommendRetirement } from "./usage.js";
import { doctorCheck } from "./doctor.js";
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
    case "retire": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts retire <skillName>");
        return 2;
      }
      await retire(name, cfg);
      console.log(`retired: ${name}`);
      return 0;
    }
    case "restore": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts restore <skillName>");
        return 2;
      }
      await restore(name, cfg);
      console.log(`restored: ${name}`);
      return 0;
    }
    case "recover": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts recover <skillName>");
        return 2;
      }
      await recover(name, cfg);
      console.log(`recovered: ${name}`);
      return 0;
    }
    case "budget": {
      const check = checkBudget(cfg);
      console.log(JSON.stringify(check, null, 2));
      return check.ok ? 0 : 1;
    }
    case "validate": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts validate <candidateName>");
        return 2;
      }
      const result = await validateCandidate(cfg, name, process.cwd());
      console.log(`valid: ${result.name} at ${result.dir}`);
      return 0;
    }
    case "promote": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts promote <candidateName>");
        return 2;
      }
      // Read optional evidence JSON from stdin (required for template scope).
      let opts: { evidence?: { projects: string[]; modelIds: string[] } } = {};
      const stdin = await readStdinSafe();
      if (stdin.trim()) {
        opts = JSON.parse(stdin);
      }
      const dest = await promote(name, cfg, opts);
      console.log(dest);
      return 0;
    }
    case "rollback": {
      const name = rest[0];
      if (!name) {
        console.error("usage: cli.ts rollback <skillName>");
        return 2;
      }
      await rollbackPromote(name, cfg);
      console.log(`rolled back: ${name}`);
      return 0;
    }
    case "usage": {
      const action = rest[0];
      if (!action) {
        console.error("usage: cli.ts usage <record|report|recommend> [args]");
        return 2;
      }
      if (action === "record") {
        const name = rest[1];
        if (!name) {
          console.error("usage: cli.ts usage record <skillName> [--session <id>]");
          return 2;
        }
        const sessionFlag = rest.indexOf("--session");
        const sessionID =
          sessionFlag >= 0 && rest[sessionFlag + 1] ? rest[sessionFlag + 1] : "manual";
        appendUsage({ skill: name, sessionID, timestamp: Date.now() }, cfg);
        console.log(`recorded: ${name}`);
        return 0;
      }
      if (action === "report") {
        const mined = scanMinedSkills(cfg);
        const report = usageReport(cfg, { skills: mined.map((s) => s.name) });
        console.log(JSON.stringify(report, null, 2));
        return 0;
      }
      if (action === "recommend") {
        const mined = scanMinedSkills(cfg);
        const recs = recommendRetirement(cfg, { skills: mined.map((s) => s.name) });
        console.log(JSON.stringify(recs, null, 2));
        return 0;
      }
      console.error(`unknown usage action: ${action}`);
      return 2;
    }
    case "doctor": {
      const report = doctorCheck(cfg);
      console.log(JSON.stringify(report, null, 2));
      return report.overall.ok ? 0 : 1;
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

function readStdinSafe(): Promise<string> {
  // Returns "" if stdin is empty/closed (no TTY), so promote can skip evidence.
  try {
    if (process.stdin.isTTY) return Promise.resolve("");
  } catch {
    // not a TTY environment — read available input
  }
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
