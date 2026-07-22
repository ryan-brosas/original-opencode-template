import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import type { SkillMineConfig } from "./config.js";
import { validateSkill, type ValidatedSkill } from "./schema.js";
import { checkCollision, loadInTempProject } from "./loader.js";

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function candidateDir(cfg: SkillMineConfig, name: string): string {
  return join(cfg.runtimeRoot, "candidates", name);
}

export function writeCandidate(
  cfg: SkillMineConfig,
  name: string,
  skillMdContent: string,
  helpers?: Record<string, string>,
): string {
  if (!NAME_RE.test(name) || name.length > 64) {
    throw new Error(`invalid candidate name: '${name}'`);
  }
  if (name.includes("..") || name.includes("/")) {
    throw new Error(`invalid candidate name: '${name}'`);
  }
  const dir = candidateDir(cfg, name);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "SKILL.md"), skillMdContent, { mode: 0o600 });
  if (helpers) {
    for (const [filename, content] of Object.entries(helpers)) {
      if (filename.includes("..") || filename.includes("/")) {
        throw new Error(`invalid helper filename: '${filename}'`);
      }
      writeFileSync(join(dir, filename), content, { mode: 0o600 });
    }
  }
  return dir;
}

export function smokeHelpers(dir: string): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".js"));
  } catch {
    return { ok: true, errors };
  }
  for (const file of files) {
    const result = spawnSync(
      "bun",
      ["build", join(dir, file), "--target", "bun", "--outfile", "/dev/null"],
      { encoding: "utf-8", timeout: 10000 },
    );
    if (result.status !== 0) {
      errors.push(`${file}: ${result.stderr || "bun build failed"}`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export async function validateCandidate(
  cfg: SkillMineConfig,
  name: string,
  cwd: string,
): Promise<{ name: string; dir: string; validated: ValidatedSkill }> {
  const dir = candidateDir(cfg, name);
  if (!existsSync(dir)) {
    throw new Error(`candidate directory not found: ${dir}`);
  }

  const result = validateSkill(dir, "mined-admission");
  if (!result.ok || !result.skill) {
    const msgs = result.failures.map((f) => f.message).join("; ");
    throw new Error(`candidate validation failed: ${msgs}`);
  }

  const smoke = smokeHelpers(dir);
  if (!smoke.ok) {
    throw new Error(`helper smoke test failed: ${smoke.errors.join("; ")}`);
  }

  const collides = await checkCollision(name, cwd);
  if (collides) {
    throw new Error(`candidate name '${name}' already exists in the live skill catalog`);
  }

  const loaded = await loadInTempProject(dir, name);
  if (loaded.name !== name) {
    throw new Error(`loader returned name '${loaded.name}', expected '${name}'`);
  }
  if (loaded.description !== result.skill.description) {
    throw new Error("loader description does not match schema description");
  }

  return { name, dir, validated: result.skill };
}
