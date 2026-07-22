#!/usr/bin/env bash
# sync-template.sh — Regenerate template/.opencode from the shippable subset of .opencode.
#
# Copies every shippable file from .opencode/ to template/.opencode/, removes template
# files that no longer ship, and regenerates .template-manifest.json with fresh SHA-256
# hashes. Working-state files (node_modules, .fallow, .fallowrc.json, bun.lock,
# roadmap.md, state.md, tech-stack.md, and the manifest itself) are excluded.
# package.json + package-lock.json ship so consumers can run
# `npm ci --prefix .opencode` to enable the semantic typecheck (verify.sh Check 4/5).
#
# The nested .gitignore ships so consumers inherit the .skill-mine/ ignore rule
# (skill-mine runtime state is private and must never be committed).
#
# Skill-mine scope boundary: `.skill-mine` (ignored runtime state) and
# `project-skills` (project-scoped mined skills) never ship — only the template
# skill root `.opencode/skill/` and the skill-mine tool/config ship to consumers.
#
# Artifacts use a generic allowlist: under artifacts/, only MEMORY.md, todo.md, and
# example/** ship. Every other artifact path (active feature dirs, specs, plans,
# progress, .active, research notes) is excluded — so no working feature leaks into
# the generated template.
#
# This is the export mechanism that keeps the untracked template/ reference copy in sync
# without hand-editing it. Run after meaningful .opencode changes:
#
#   bash .opencode/tool/sync-template.sh
#
# Exits non-zero on any copy or hash failure.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SRC="$ROOT/.opencode"
DST="$ROOT/template/.opencode"
MANIFEST="$SRC/.template-manifest.json"

if [[ ! -d "$SRC" ]]; then
  echo "sync-template: source $SRC not found" >&2
  exit 1
fi

# General working-state exclusions (everything except artifacts/, which uses an
# allowlist below). A relative path ships unless it equals one of these or sits
# beneath one of these as a directory prefix.
EXCLUDES=(
  "node_modules"
  ".fallow"
  ".fallowrc.json"
  "bun.lock"
  "roadmap.md"
  "state.md"
  "tech-stack.md"
  ".template-manifest.json"
  "project-skills"
  ".skill-mine"
  ".sandbox-state"
)

is_excluded() {
  local rel="$1" ex
  for ex in "${EXCLUDES[@]}"; do
    if [[ "$rel" == "$ex" || "$rel" == "$ex"/* ]]; then
      return 0
    fi
  done
  return 1
}

# Generic artifact allowlist: a path under artifacts/ ships only if it is MEMORY.md,
# todo.md, or beneath example/. Everything else (feature dirs, .active, specs/plans/
# progress/research for in-flight work) is excluded.
ships_artifact() {
  local rel="$1"
  [[ "$rel" == "artifacts/MEMORY.md" || "$rel" == "artifacts/todo.md" || "$rel" == "artifacts/example/"* ]]
}

# Build the shippable file list (relative paths, sorted, no leading ./).
mapfile -t raw < <(cd "$SRC" && find . -type f -not -path './node_modules/*')
ship=()
for f in "${raw[@]}"; do
  rel="${f#./}"
  if [[ "$rel" == artifacts/* ]]; then
    if ships_artifact "$rel"; then
      ship+=("$rel")
    fi
  elif ! is_excluded "$rel"; then
    ship+=("$rel")
  fi
done
mapfile -t ship < <(printf '%s\n' "${ship[@]}" | sort)

# Copy every shippable file into the destination, preserving structure.
for f in "${ship[@]}"; do
  mkdir -p "$DST/$(dirname "$f")"
  cp "$SRC/$f" "$DST/$f"
done

# Remove destination files that no longer ship (stale deletions such as removed plugins).
mapfile -t dst_raw < <(cd "$DST" && find . -type f -not -path './node_modules/*' 2>/dev/null || true)
declare -A ship_set=()
for f in "${ship[@]}"; do
  ship_set["$f"]=1
done
for f in "${dst_raw[@]}"; do
  rel="${f#./}"
  if [[ -z "${ship_set[$rel]:-}" ]]; then
    rm -f "$DST/$rel"
    # Best-effort cleanup of now-empty directories.
    d="$DST/$(dirname "$rel")"
    while [[ "$d" > "$DST" ]] && rmdir "$d" 2>/dev/null; do
      d="$(dirname "$d")"
    done
  fi
done

# Regenerate the manifest with fresh hashes via a single node call.
VERSION="$(cat "$SRC/.version" 2>/dev/null || echo "0.0.0")"
printf '%s\n' "${ship[@]}" > /tmp/.sync-ship-list
node -e '
  const fs = require("fs");
  const crypto = require("crypto");
  const src = process.argv[1];
  const manifest = process.argv[2];
  const version = process.argv[3];
  const createdAt = process.argv[4];
  const list = fs.readFileSync("/tmp/.sync-ship-list", "utf8").split("\n").filter(Boolean);
  const files = {};
  for (const rel of list) {
    const data = fs.readFileSync(src + "/" + rel);
    files[rel] = crypto.createHash("sha256").update(data).digest("hex");
  }
  const out = { version, createdAt, files };
  fs.writeFileSync(manifest, JSON.stringify(out, null, 2) + "\n");
  fs.copyFileSync(manifest, src.replace(/\.opencode$/, "/template/.opencode") + "/.template-manifest.json");
' "$SRC" "$MANIFEST" "$VERSION" "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
rm -f /tmp/.sync-ship-list

echo "sync-template: synced ${#ship[@]} files to template/.opencode and regenerated .template-manifest.json"
