// Skill-Mine receipt-only sanitized capture.
//
// `capture <sha>` reads a finalized receipt, re-validates the git binding
// (the sha is a real commit, its tree matches the receipt, the receipt's
// commitSha matches), runs the privacy scan over the receipt's free-text
// evidence (summary + risks + changed paths), and only then writes a
// sanitized MinedTrace to the ignored runtime tree. No raw prompts, tool
// output, diffs, or arbitrary command strings are stored — only the
// allowlisted receipt fields plus check identifiers.

import { existsSync, readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { join } from "node:path";
import type { SkillMineConfig } from "./config.js";
import type { CheckResult, FinalizedReceipt, MinedTrace } from "./types.js";
import { scanFreeText } from "./schema.js";
import { git } from "./receipts.js";

export async function capture(
  commitSha: string,
  cfg: SkillMineConfig,
  cwd: string = process.cwd(),
): Promise<MinedTrace> {
  const finalizedFile = join(cfg.runtimeRoot, "receipts", `${commitSha}.finalized.json`);
  if (!existsSync(finalizedFile)) {
    throw new Error(`no finalized receipt for ${commitSha}`);
  }
  const receipt = JSON.parse(readFileSync(finalizedFile, "utf8")) as FinalizedReceipt;
  if (receipt.status !== "finalized") {
    throw new Error(`receipt for ${commitSha} is not finalized`);
  }
  // The receipt's own commitSha must match the sha we were asked to capture.
  if (receipt.commitSha !== commitSha) {
    throw new Error(`receipt commitSha (${receipt.commitSha}) != requested sha (${commitSha})`);
  }

  // The sha must be a real commit object (not a tree, tag, or blob) — blocks
  // forging a receipt named after an uncommitted `git write-tree` object.
  let objectType: string;
  try {
    objectType = await git(["cat-file", "-t", commitSha], cwd);
  } catch {
    throw new Error(`commit not found: ${commitSha}`);
  }
  if (objectType !== "commit") {
    throw new Error(`${commitSha} is a ${objectType}, not a commit`);
  }

  let actualTree: string;
  try {
    actualTree = await git(["rev-parse", `${commitSha}^{tree}`], cwd);
  } catch {
    throw new Error(`commit tree not found: ${commitSha}`);
  }
  if (actualTree !== receipt.commitTreeHash) {
    throw new Error(
      `tree mismatch: ${commitSha} tree ${actualTree} != receipt ${receipt.commitTreeHash}`,
    );
  }

  // Privacy gate — scan ALL retained free-text fields, including changed paths.
  const privacyFailures = scanFreeText(
    [receipt.summary, receipt.risks, ...receipt.changedPaths].join("\n"),
  );
  if (privacyFailures.length > 0) {
    const f = privacyFailures[0];
    throw new Error(`secret detected in receipt evidence (${f.code}): ${f.message}`);
  }

  const trace: MinedTrace = {
    workUnitId: receipt.workUnitId,
    commitSha: receipt.commitSha,
    commitTreeHash: receipt.commitTreeHash,
    branch: receipt.branch,
    changedPaths: receipt.changedPaths,
    // Reconstruct checks as exactly {id, exitCode} — defense in depth.
    checks: receipt.checks.map((c) => ({ id: c.id, exitCode: c.exitCode }) as CheckResult),
    summary: receipt.summary,
    risks: receipt.risks,
    judgeVersion: receipt.judgeVersion,
    capturedAt: new Date().toISOString(),
  };

  const dir = join(cfg.runtimeRoot, "traces");
  mkdirSync(dir, { recursive: true });
  chmodSync(dir, 0o700);
  const path = join(dir, `${commitSha}.json`);
  writeFileSync(path, JSON.stringify(trace, null, 2) + "\n", { mode: 0o600 });
  chmodSync(path, 0o600);
  return trace;
}
