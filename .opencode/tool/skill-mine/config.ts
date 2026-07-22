// Skill-Mine configuration and runtime bootstrap.
//
// Tracked configuration lives in `.opencode/skill-mine.json` (shipped, the
// authoritative control plane). Ignored runtime state lives under
// `.opencode/.skill-mine/` and is rebuildable — never authoritative.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface SkillMineConfig {
  schemaVersion: number;
  judgeVersion: string;
  maxActiveMinedSkills: number;
  maxDescriptionBytes: number;
  maxAggregateDescriptionBytes: number;
  /** Project-scoped active skill root (sync-excluded). */
  projectSkillsRoot: string;
  /** Template-scoped active skill root (synced). */
  templateSkillsRoot: string;
  /** Ignored runtime root, created lazily at 0700. */
  runtimeRoot: string;
}

export interface RuntimeDirs {
  receipts: string;
  traces: string;
  candidates: string;
  journal: string;
  archive: string;
}

export const DEFAULT_CONFIG: SkillMineConfig = {
  schemaVersion: 1,
  judgeVersion: "v1-writing-skills",
  maxActiveMinedSkills: 10,
  maxDescriptionBytes: 240,
  maxAggregateDescriptionBytes: 2400,
  projectSkillsRoot: ".opencode/project-skills",
  templateSkillsRoot: ".opencode/skill",
  runtimeRoot: ".opencode/.skill-mine",
};

const RUNTIME_DIR_NAMES = ["receipts", "traces", "candidates", "journal", "archive"] as const;

const SUPPORTED_SCHEMA_VERSION = 1;

/**
 * Load and validate the tracked skill-mine configuration file.
 * Throws a clear error if the file is missing, unparseable, or violates the
 * schema. The file is authoritative; ignored runtime state is never read here.
 */
export function loadConfig(configPath: string): SkillMineConfig {
  if (!existsSync(configPath)) {
    throw new Error(`skill-mine config not found: ${configPath}`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(configPath, "utf8"));
  } catch {
    throw new Error(`skill-mine config is not valid JSON: ${configPath}`);
  }

  const cfg = raw as Partial<SkillMineConfig>;

  if (cfg.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `skill-mine config schemaVersion must be ${SUPPORTED_SCHEMA_VERSION}, got ${String(cfg.schemaVersion)}`,
    );
  }
  if (!isPositiveNumber(cfg.maxActiveMinedSkills)) {
    throw new Error("skill-mine config maxActiveMinedSkills must be a positive number");
  }
  if (!isPositiveNumber(cfg.maxDescriptionBytes)) {
    throw new Error("skill-mine config maxDescriptionBytes must be a positive number");
  }
  if (!isPositiveNumber(cfg.maxAggregateDescriptionBytes)) {
    throw new Error("skill-mine config maxAggregateDescriptionBytes must be a positive number");
  }
  if (typeof cfg.judgeVersion !== "string" || cfg.judgeVersion.length === 0) {
    throw new Error("skill-mine config judgeVersion must be a non-empty string");
  }

  return {
    schemaVersion: cfg.schemaVersion,
    judgeVersion: cfg.judgeVersion,
    maxActiveMinedSkills: cfg.maxActiveMinedSkills,
    maxDescriptionBytes: cfg.maxDescriptionBytes,
    maxAggregateDescriptionBytes: cfg.maxAggregateDescriptionBytes,
    projectSkillsRoot: cfg.projectSkillsRoot ?? DEFAULT_CONFIG.projectSkillsRoot,
    templateSkillsRoot: cfg.templateSkillsRoot ?? DEFAULT_CONFIG.templateSkillsRoot,
    runtimeRoot: cfg.runtimeRoot ?? DEFAULT_CONFIG.runtimeRoot,
  };
}

function isPositiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * Lazily create the ignored runtime tree with restrictive 0700 permissions.
 * Idempotent: safe to call when the directories already exist. The runtime
 * root itself is also created at 0700 when absent.
 */
export function bootstrapRuntime(cfg: SkillMineConfig): RuntimeDirs {
  mkdirSync(cfg.runtimeRoot, { recursive: true, mode: 0o700 });
  const dirs = {} as RuntimeDirs;
  for (const name of RUNTIME_DIR_NAMES) {
    const dirPath = join(cfg.runtimeRoot, name);
    mkdirSync(dirPath, { recursive: true, mode: 0o700 });
    dirs[name] = dirPath;
  }
  return dirs;
}
