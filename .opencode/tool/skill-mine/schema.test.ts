import { describe, test, expect } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { validateSkill, type ValidationFailure } from "./schema.js";

function writeSkill(dir: string, data: Record<string, unknown>, body = "") {
  const yaml = Bun.YAML.stringify(data).trimEnd();
  writeFileSync(join(dir, "SKILL.md"), `---\n${yaml}\n---\n${body}\n`);
}

function withSkill<T>(folderName: string, fn: (dir: string) => T): T {
  const parent = mkdtempSync(join(tmpdir(), "sm-skill-"));
  const dir = join(parent, folderName);
  mkdirSync(dir, { recursive: true });
  try {
    return fn(dir);
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

function codes(failures: ValidationFailure[]): string[] {
  return failures.map((f) => f.code);
}

describe("validateSkill — generic-skill mode", () => {
  test("accepts a minimal valid skill", () => {
    withSkill("my-test-skill", (dir) => {
      writeSkill(dir, { name: "my-test-skill", description: "Use when testing." });
      const r = validateSkill(dir, "generic-skill");
      expect(r.ok).toBe(true);
      expect(r.skill?.name).toBe("my-test-skill");
    });
  });

  test("rejects an invalid (uppercase) name", () => {
    withSkill("myskill", (dir) => {
      writeSkill(dir, { name: "MySkill", description: "Use when x." });
      const r = validateSkill(dir, "generic-skill");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("invalid-name");
    });
  });

  test("rejects a name that does not match the folder", () => {
    withSkill("foo", (dir) => {
      writeSkill(dir, { name: "other-name", description: "Use when x." });
      const r = validateSkill(dir, "generic-skill");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("name-folder-mismatch");
    });
  });

  test("rejects a missing description", () => {
    withSkill("no-desc-skill", (dir) => {
      writeSkill(dir, { name: "no-desc-skill" });
      const r = validateSkill(dir, "generic-skill");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("missing-description");
    });
  });

  test("rejects missing frontmatter entirely", () => {
    withSkill("no-frontmatter", (dir) => {
      writeFileSync(join(dir, "SKILL.md"), "no frontmatter here");
      const r = validateSkill(dir, "generic-skill");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("missing-frontmatter");
    });
  });
});

describe("validateSkill — mined-admission mode", () => {
  const baseMined = {
    name: "mined-fix-loop",
    description: "Use when fixing a regression loop.",
    metadata: {
      origin: "skill-mine",
      source_commit: "abc123def456",
      mined_date: "2026-07-22",
      judge_version: "v1-writing-skills",
      scope: "project",
      evidence_summary: "baseline failed; treatment passed twice",
      content_hash: "deadbeefcafef00d",
    },
  };

  test("accepts a fully-provenanced clean mined skill", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, baseMined);
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(true);
      expect(r.skill?.metadata.origin).toBe("skill-mine");
    });
  });

  test("rejects when provenance metadata is missing (no origin)", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, {
        name: "mined-fix-loop",
        description: "Use when fixing a regression loop.",
        metadata: { scope: "project" },
      });
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("missing-provenance");
    });
  });

  test("rejects an invalid scope value", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, {
        ...baseMined,
        metadata: { ...baseMined.metadata, scope: "global" },
      });
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("invalid-provenance-field");
    });
  });

  test("rejects an AWS access key in the description", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, {
        ...baseMined,
        description: "Use when AKIAIOSFODNN7EXAMPLE leaks.",
      });
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("secret-detected");
    });
  });

  test("rejects a private-key block in the body", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(
        dir,
        baseMined,
        "-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----",
      );
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("secret-detected");
    });
  });

  test("rejects a raw transcript marker in the body", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, baseMined, "see <dcp-message-id>m0001</dcp-message-id> for context");
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("transcript-marker");
    });
  });

  test("rejects an absolute home path in the body", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, baseMined, "the file lives at /home/ryan/secret/key.pem");
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("absolute-home-path");
    });
  });

  test("rejects a high-entropy token in evidence_summary", () => {
    withSkill("mined-fix-loop", (dir) => {
      writeSkill(dir, {
        ...baseMined,
        metadata: {
          ...baseMined.metadata,
          evidence_summary: "token was x9K2mP7qR4sT8vW1yZ3aB5cD7eF9gH0iJ2kL4mN6oP8qR0sT2uV4wX6yZ8",
        },
      });
      const r = validateSkill(dir, "mined-admission");
      expect(r.ok).toBe(false);
      expect(codes(r.failures)).toContain("high-entropy");
    });
  });
});
