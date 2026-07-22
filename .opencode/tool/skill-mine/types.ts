// Skill-Mine receipt and trace types.
//
// A receipt is local evidence that a work unit was verified and successfully
// pushed. Receipts live in the ignored runtime tree and are never committed.
// They gate capture (mining): no finalized receipt -> nothing to mine.
//
// Only allowlisted fields are stored: work-unit id, SHA, tree hash, changed
// paths (repo-relative), check ids + exit codes, summary, risks. No raw
// prompts, tool output, diffs, or arbitrary command strings.

export interface CheckResult {
  /** Stable check identifier, e.g. "verify-sh", "tsc", "bun-test". */
  id: string;
  /** Exit code of the check; 0 = pass. */
  exitCode: number;
}

export interface ProvisionalReceipt {
  status: "provisional";
  workUnitId: string;
  /** `git write-tree` of the staged index at prepare time. */
  stagedTreeHash: string;
  /** HEAD at prepare time; finalize must observe a NEW commit (HEAD != parentSha). */
  parentSha: string;
  branch: string;
  /** Repo-relative paths the work unit touched. */
  changedPaths: string[];
  checks: CheckResult[];
  summary: string;
  risks: string;
  judgeVersion: string;
  createdAt: string;
}

export interface FinalizedReceipt {
  status: "finalized";
  workUnitId: string;
  stagedTreeHash: string;
  parentSha: string;
  /** Commit SHA after commit. */
  commitSha: string;
  /** `git rev-parse HEAD^{tree}`; must equal stagedTreeHash. */
  commitTreeHash: string;
  branch: string;
  /** `git rev-parse origin/<branch>`; must equal commitSha (push succeeded). */
  remoteHeadSha: string;
  changedPaths: string[];
  checks: CheckResult[];
  summary: string;
  risks: string;
  judgeVersion: string;
  finalizedAt: string;
}

/** Input the build agent provides at prepare time (after verify + staging). */
export interface ProvisionalInput {
  workUnitId: string;
  changedPaths: string[];
  checks: CheckResult[];
  summary: string;
  risks: string;
}

/** Sanitized trace written by capture; consumed by distill. */
export interface MinedTrace {
  workUnitId: string;
  commitSha: string;
  commitTreeHash: string;
  branch: string;
  changedPaths: string[];
  checks: CheckResult[];
  summary: string;
  risks: string;
  judgeVersion: string;
  capturedAt: string;
}
