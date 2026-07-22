import { describe, test, expect, afterEach } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadInTempProject, checkCollision, type LoadedSkill } from "./loader.js";

let roots: string[] = [];

function tempSkillDir(name: string, body = "Probe body."): string {
  const root = mkdtempSync(join(tmpdir(), "sm-loader-"));
  roots.push(root);
  const skillDir = join(root, name);
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    [
      "---",
      `name: ${name}`,
      `description: Use when probing the ${name} loader.`,
      "---",
      "",
      `# ${name}`,
      "",
      body,
      "",
    ].join("\n"),
  );
  return skillDir;
}

afterEach(() => {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
  roots = [];
});

describe("checkCollision", () => {
  test("returns true for a name in the live catalog", async () => {
    const exists = await checkCollision("memory", process.cwd());
    expect(exists).toBe(true);
  });

  test("returns false for a unique name", async () => {
    const exists = await checkCollision("zzz-unique-nonexistent-probe-skill", process.cwd());
    expect(exists).toBe(false);
  });
});

describe("loadInTempProject", () => {
  test("finds the candidate with exact name, description, location, and content", async () => {
    const dir = tempSkillDir("probe-loader-skill", "Probe body text.");
    const loaded = await loadInTempProject(dir, "probe-loader-skill");
    expect(loaded.name).toBe("probe-loader-skill");
    expect(loaded.description).toContain("probing");
    expect(loaded.content).toContain("Probe body text.");
    expect(loaded.location).toContain("probe-loader-skill");
  });

  test("rejects when the skill is not found in the temp project", async () => {
    const dir = tempSkillDir("probe-loader-skill");
    await expect(loadInTempProject(dir, "wrong-name")).rejects.toThrow(/not found|missing|absent/i);
  });
});
