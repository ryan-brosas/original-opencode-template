// Skill-Mine frontmatter, provenance and privacy validation.
//
// Two modes:
//   - "generic-skill"    : validate official OpenCode frontmatter (name +
//                          description) plus a privacy scan. Hand-authored.
//   - "mined-admission"  : generic checks PLUS required string-valued provenance
//                          metadata and a stricter privacy boundary.
//
// Privacy scans cover free-text only (description, evidence_summary, body) so
// structured provenance like a 40-char source_commit or content_hash does not
// trip the high-entropy detector.

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { createHash } from "node:crypto";

export type ValidationMode = "generic-skill" | "mined-admission";

export type ValidationErrorCode =
  | "missing-frontmatter"
  | "invalid-name"
  | "name-folder-mismatch"
  | "missing-description"
  | "invalid-metadata-type"
  | "missing-provenance"
  | "invalid-provenance-field"
  | "secret-detected"
  | "transcript-marker"
  | "absolute-home-path"
  | "high-entropy";

export interface ValidationFailure {
  code: ValidationErrorCode;
  message: string;
  field?: string;
}

export interface ValidatedSkill {
  name: string;
  description: string;
  metadata: Record<string, string>;
  contentHash: string;
  mode: ValidationMode;
}

export interface ValidationResult {
  ok: boolean;
  skill?: ValidatedSkill;
  failures: ValidationFailure[];
}

const REQUIRED_PROVENANCE = [
  "origin",
  "source_commit",
  "mined_date",
  "judge_version",
  "scope",
  "evidence_summary",
  "content_hash",
] as const;

const VALID_SCOPES = ["project", "template"] as const;

// lowercase alnum with single hyphens; 1-64 chars; no leading/trailing/double hyphen
const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const NAME_MAX_LEN = 64;

export function validateSkill(skillDir: string, mode: ValidationMode): ValidationResult {
  const failures: ValidationFailure[] = [];
  const skillPath = join(skillDir, "SKILL.md");

  let content: string;
  try {
    content = readFileSync(skillPath, "utf8");
  } catch {
    failures.push({
      code: "missing-frontmatter",
      message: `cannot read ${skillPath}`,
    });
    return { ok: false, failures };
  }

  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!fmMatch) {
    failures.push({
      code: "missing-frontmatter",
      message: "SKILL.md has no YAML frontmatter block",
    });
    return { ok: false, failures };
  }

  const [, yamlText, body] = fmMatch;
  let data: Record<string, unknown>;
  try {
    data = Bun.YAML.parse(yamlText) as Record<string, unknown>;
  } catch {
    failures.push({
      code: "missing-frontmatter",
      message: "frontmatter is not valid YAML",
    });
    return { ok: false, failures };
  }

  const folderName = basename(skillDir);
  const name = data.name;

  if (typeof name !== "string" || !NAME_PATTERN.test(name) || name.length > NAME_MAX_LEN) {
    failures.push({
      code: "invalid-name",
      message: `name must be lowercase alnum + single hyphens, <=${NAME_MAX_LEN} chars`,
      field: "name",
    });
  } else if (name !== folderName) {
    failures.push({
      code: "name-folder-mismatch",
      message: `frontmatter name '${name}' does not match folder '${folderName}'`,
      field: "name",
    });
  }

  const description = data.description;
  if (typeof description !== "string" || description.trim() === "") {
    failures.push({
      code: "missing-description",
      message: "description is required and must be non-empty",
      field: "description",
    });
  }

  const metadataRaw = data.metadata;
  const metaMap: Record<string, string> = {};
  if (metadataRaw !== undefined) {
    if (typeof metadataRaw !== "object" || metadataRaw === null || Array.isArray(metadataRaw)) {
      failures.push({
        code: "invalid-metadata-type",
        message: "metadata must be a string-valued map",
        field: "metadata",
      });
    } else {
      for (const [k, v] of Object.entries(metadataRaw)) {
        metaMap[k] = typeof v === "string" ? v : String(v);
      }
    }
  }

  if (mode === "mined-admission") {
    const missing = REQUIRED_PROVENANCE.filter((k) => !(k in metaMap));
    if (missing.length > 0) {
      failures.push({
        code: "missing-provenance",
        message: `missing provenance metadata: ${missing.join(", ")}`,
        field: "metadata",
      });
    } else {
      if (metaMap.origin !== "skill-mine") {
        failures.push({
          code: "invalid-provenance-field",
          message: "metadata.origin must be 'skill-mine'",
          field: "metadata.origin",
        });
      }
      if (!VALID_SCOPES.includes(metaMap.scope as (typeof VALID_SCOPES)[number])) {
        failures.push({
          code: "invalid-provenance-field",
          message: "metadata.scope must be 'project' or 'template'",
          field: "metadata.scope",
        });
      }
    }
  }

  // Privacy scan runs in both modes — secrets never belong in a shipped skill.
  scanPrivacy(String(description ?? ""), body, metaMap, failures);

  if (failures.length > 0) {
    return { ok: false, failures };
  }

  const contentHash = createHash("sha256").update(content).digest("hex");
  return {
    ok: true,
    skill: {
      name: String(name),
      description: String(description),
      metadata: metaMap,
      contentHash,
      mode,
    },
    failures: [],
  };
}

function scanPrivacy(
  description: string,
  body: string,
  metaMap: Record<string, string>,
  failures: ValidationFailure[],
): void {
  const freeText = [description, metaMap.evidence_summary ?? "", body].join("\n");
  failures.push(...scanFreeText(freeText));
}

/**
 * Run the privacy scan over a single free-text blob. Returns any failures.
 * Exported so capture can reuse the exact same patterns over receipt evidence
 * (summary + risks) — the last gate before a trace is written.
 */
export function scanFreeText(freeText: string): ValidationFailure[] {
  const failures: ValidationFailure[] = [];

  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(freeText)) {
    failures.push({
      code: "secret-detected",
      message: "private-key block detected in free text",
    });
  }
  if (/AKIA[0-9A-Z]{16}/.test(freeText)) {
    failures.push({
      code: "secret-detected",
      message: "AWS access key id detected in free text",
    });
  }
  if (/ASIA[0-9A-Z]{16}/.test(freeText)) {
    failures.push({
      code: "secret-detected",
      message: "AWS STS temporary access key id detected in free text",
    });
  }
  if (/gh[pousr]_[A-Za-z0-9]{36,}/.test(freeText)) {
    failures.push({
      code: "secret-detected",
      message: "GitHub token detected in free text",
    });
  }
  if (/<dcp-message-id>|<session_summary>/.test(freeText)) {
    failures.push({
      code: "transcript-marker",
      message: "raw transcript marker detected in free text",
    });
  }
  if (/\/home\/[^/\s]+\//.test(freeText) || /\/Users\/[^/\s]+\//.test(freeText)) {
    failures.push({
      code: "absolute-home-path",
      message: "absolute home path detected in free text",
    });
  }

  const tokens = freeText.match(/[A-Za-z0-9+/_=-]{32,}/g) ?? [];
  for (const token of tokens) {
    // Catch high-entropy secrets across alphabets: either a wide character set
    // (>=20 distinct) OR a long token (>=64 chars) that could be hex/base64.
    if ((distinctChars(token) >= 20 || token.length >= 64) && shannonEntropy(token) >= 3.5) {
      failures.push({
        code: "high-entropy",
        message: "high-entropy token detected in free text (likely a secret)",
      });
      break;
    }
  }
  return failures;
}

function distinctChars(s: string): number {
  return new Set(s).size;
}

function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const ch of s) freq.set(ch, (freq.get(ch) ?? 0) + 1);
  let entropy = 0;
  const len = s.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }
  return entropy;
}
