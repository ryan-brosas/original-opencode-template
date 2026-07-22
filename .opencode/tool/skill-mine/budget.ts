// Skill-Mine catalog and scope governance.
//
// scanMinedSkills: walk the active roots (project + template), read each
//   SKILL.md, and return only those with metadata.origin: skill-mine.
// checkBudget: enforce the global count plus per-description and aggregate
//   description-byte budgets from the tracked config.
// checkTemplatePromotionEvidence: template-scope promotion requires evidence
//   from at least two projects and two runtime/model identities.

import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { SkillMineConfig } from "./config.js";
import { validateSkill } from "./schema.js";

export type Scope = "project" | "template";

export interface MinedSkillInfo {
  name: string;
  scope: Scope;
  description: string;
  descriptionBytes: number;
  dir: string;
}

export interface BudgetCheck {
  count: number;
  maxCount: number;
  aggregateDescriptionBytes: number;
  maxAggregateDescriptionBytes: number;
  ok: boolean;
  failures: string[];
}

export interface PromotionEvidence {
  projects: string[];
  modelIds: string[];
}

const MIN_PROJECTS_FOR_TEMPLATE = 2;
const MIN_MODELS_FOR_TEMPLATE = 2;

/**
 * Walk the active skill roots and return only mined skills (metadata.origin:
 * skill-mine). Hand-authored skills are skipped.
 */
export function scanMinedSkills(cfg: SkillMineConfig): MinedSkillInfo[] {
  const skills: MinedSkillInfo[] = [];
  const roots: Array<{ root: string; scope: Scope }> = [
    { root: cfg.projectSkillsRoot, scope: "project" },
    { root: cfg.templateSkillsRoot, scope: "template" },
  ];

  for (const { root, scope } of roots) {
    if (!existsSync(root)) continue;
    let entries: string[];
    try {
      entries = readdirSync(root);
    } catch {
      continue;
    }
    for (const entry of entries) {
      const dir = join(root, entry);
      try {
        if (!statSync(dir).isDirectory()) continue;
      } catch {
        continue;
      }
      const result = validateSkill(dir, "mined-admission");
      if (!result.ok || !result.skill) continue;
      // Only count skills whose declared scope matches the root they live in.
      const declaredScope = result.skill.metadata.scope;
      if (declaredScope !== scope) continue;
      const descBytes = Buffer.byteLength(result.skill.description, "utf8");
      skills.push({
        name: result.skill.name,
        scope,
        description: result.skill.description,
        descriptionBytes: descBytes,
        dir,
      });
    }
  }

  return skills;
}

/**
 * Check the global count plus per-description and aggregate description-byte
 * budgets. Returns failures if any limit is exceeded.
 */
export function checkBudget(cfg: SkillMineConfig): BudgetCheck {
  const skills = scanMinedSkills(cfg);
  const failures: string[] = [];

  if (skills.length > cfg.maxActiveMinedSkills) {
    failures.push(`mined skill count ${skills.length} exceeds max ${cfg.maxActiveMinedSkills}`);
  }

  let aggregate = 0;
  for (const s of skills) {
    aggregate += s.descriptionBytes;
    if (s.descriptionBytes > cfg.maxDescriptionBytes) {
      failures.push(
        `skill '${s.name}' description is ${s.descriptionBytes} bytes, exceeds max ${cfg.maxDescriptionBytes}`,
      );
    }
  }

  if (aggregate > cfg.maxAggregateDescriptionBytes) {
    failures.push(
      `aggregate description bytes ${aggregate} exceeds max ${cfg.maxAggregateDescriptionBytes}`,
    );
  }

  return {
    count: skills.length,
    maxCount: cfg.maxActiveMinedSkills,
    aggregateDescriptionBytes: aggregate,
    maxAggregateDescriptionBytes: cfg.maxAggregateDescriptionBytes,
    ok: failures.length === 0,
    failures,
  };
}

/**
 * Template-scope promotion requires evidence that the skill works across at
 * least MIN_PROJECTS_FOR_TEMPLATE distinct projects and MIN_MODELS_FOR_TEMPLATE
 * distinct runtime/model identities.
 */
export function checkTemplatePromotionEvidence(evidence: PromotionEvidence): {
  ok: boolean;
  failures: string[];
} {
  const failures: string[] = [];
  const distinctProjects = new Set(evidence.projects);
  const distinctModels = new Set(evidence.modelIds);

  if (distinctProjects.size < MIN_PROJECTS_FOR_TEMPLATE) {
    failures.push(
      `template promotion requires evidence from at least ${MIN_PROJECTS_FOR_TEMPLATE} projects, got ${distinctProjects.size}`,
    );
  }
  if (distinctModels.size < MIN_MODELS_FOR_TEMPLATE) {
    failures.push(
      `template promotion requires evidence from at least ${MIN_MODELS_FOR_TEMPLATE} runtime/model identities, got ${distinctModels.size}`,
    );
  }

  return { ok: failures.length === 0, failures };
}
