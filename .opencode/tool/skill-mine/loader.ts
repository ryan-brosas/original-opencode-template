import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  rmSync,
  readFileSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

export interface LoadedSkill {
  name: string;
  description: string;
  location: string;
  content: string;
}

function runOpencodeDebugSkill(cwd: string): LoadedSkill[] {
  const outFile = join(tmpdir(), `sm-skill-output-${process.pid}-${Date.now()}.json`);
  const result = spawnSync("sh", ["-c", `opencode debug skill --pure > "${outFile}"`], {
    cwd,
    env: {
      ...process.env,
      OPENCODE_DISABLE_EXTERNAL_SKILLS: "1",
      OPENCODE_DISABLE_CLAUDE_CODE_SKILLS: "1",
    },
    encoding: "utf-8",
    timeout: 30000,
  });
  if (result.status !== 0) {
    try {
      unlinkSync(outFile);
    } catch {}
    throw new Error(`opencode debug skill --pure exited ${result.status}: ${result.stderr ?? ""}`);
  }
  let output: string;
  try {
    output = readFileSync(outFile, "utf-8");
  } finally {
    try {
      unlinkSync(outFile);
    } catch {}
  }
  try {
    return JSON.parse(output) as LoadedSkill[];
  } catch {
    const start = output.indexOf("[");
    const end = output.lastIndexOf("]");
    if (start === -1 || end === -1) {
      throw new Error("opencode debug skill --pure did not return a JSON array");
    }
    return JSON.parse(output.slice(start, end + 1)) as LoadedSkill[];
  }
}

export async function loadInTempProject(
  candidateDir: string,
  candidateName: string,
): Promise<LoadedSkill> {
  const tempProject = mkdtempSync(join(tmpdir(), "sm-load-"));
  try {
    spawnSync("git", ["init", "-q"], { cwd: tempProject, timeout: 5000 });

    const skillRoot = join(tempProject, ".opencode", "skill", candidateName);
    mkdirSync(skillRoot, { recursive: true });
    for (const file of readdirSync(candidateDir)) {
      copyFileSync(join(candidateDir, file), join(skillRoot, file));
    }

    const skills = runOpencodeDebugSkill(tempProject);
    const found = skills.find((s) => s.name === candidateName);
    if (!found) {
      throw new Error(`skill '${candidateName}' not found in isolated loader output`);
    }
    if (!found.description) {
      throw new Error(`loaded skill '${candidateName}' has no description`);
    }
    if (!found.content) {
      throw new Error(`loaded skill '${candidateName}' has no content`);
    }
    return found;
  } finally {
    rmSync(tempProject, { recursive: true, force: true });
  }
}

export async function checkCollision(name: string, cwd: string): Promise<boolean> {
  const skills = runOpencodeDebugSkill(cwd);
  return skills.some((s) => s.name === name);
}
