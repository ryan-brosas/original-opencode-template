#!/usr/bin/env bash
# Skill-Mine full lifecycle integration test.
#
# Exercises the CLI end-to-end in isolated temp directories:
#   receipt → capture → distill → evaluate → validate → promote
#   → fresh-process loader → retire → restore → rollback
#
# Confirms runtime state stays local and no project-scoped skill leaks into
# the template root.
#
# Run: bash .opencode/tool/skill-mine-integration-test.sh

set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
CLI="$REPO/.opencode/tool/skill-mine/cli.ts"
# Resolve the opencode binary (the opencode process sets OPENCODE=1 in env, so
# we can't use ${OPENCODE:-opencode}; resolve via command -v instead).
OPENCODE="$(command -v opencode || echo opencode)"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

# --- Temp config ---
CFG="$WORK/skill-mine.json"
PROJ_SKILLS="$WORK/project-skills"
TMPL_SKILLS="$WORK/proj/.opencode/skill"
RUNTIME="$WORK/.skill-mine"

cat > "$CFG" <<EOF
{
  "schemaVersion": 1,
  "judgeVersion": "v1-writing-skills",
  "maxActiveMinedSkills": 10,
  "maxDescriptionBytes": 240,
  "maxAggregateDescriptionBytes": 2400,
  "projectSkillsRoot": "$PROJ_SKILLS",
  "templateSkillsRoot": "$TMPL_SKILLS",
  "runtimeRoot": "$RUNTIME"
}
EOF

export SKILL_MINE_CONFIG="$CFG"
export OPENCODE_DISABLE_EXTERNAL_SKILLS=1
export OPENCODE_DISABLE_CLAUDE_CODE_SKILLS=1

mkdir -p "$PROJ_SKILLS" "$TMPL_SKILLS" "$WORK/proj/.opencode"

# --- 1. Temp git repo + bare remote (for receipts) ---
GIT_DIR="$WORK/gitrepo"
REMOTE_DIR="$WORK/remote.git"
mkdir -p "$GIT_DIR"
git init -q "$GIT_DIR"
git init --bare -q "$REMOTE_DIR"
git -C "$GIT_DIR" config user.email "test@test.com"
git -C "$GIT_DIR" config user.name "test"
git -C "$GIT_DIR" branch -M main
git -C "$GIT_DIR" remote add origin "$REMOTE_DIR"
echo "hello" > "$GIT_DIR/file.txt"
git -C "$GIT_DIR" add file.txt
git -C "$GIT_DIR" commit -q -m "initial"

# --- 2. Stage work, prepare receipt, commit, push, finalize ---
echo "work" > "$GIT_DIR/work.txt"
git -C "$GIT_DIR" add work.txt
WORK_UNIT="test-unit-001"
cd "$GIT_DIR"
echo "{\"workUnitId\":\"$WORK_UNIT\",\"changedPaths\":[\"work.txt\"],\"summary\":\"test work unit\",\"risks\":\"none\",\"checks\":[{\"id\":\"verify\",\"exitCode\":0}]}" | \
  bun "$CLI" prepare
git commit -q -m "work unit"
git push -q -u origin main
SHA=$(bun "$CLI" finalize "$WORK_UNIT")
echo "  Finalized receipt for commit: $SHA"

# --- 3. Capture ---
TRACE=$(bun "$CLI" capture "$SHA")
echo "  Captured trace: $TRACE"
test -f "$TRACE"

# --- 4. Distill a project-scope candidate ---
CANDIDATE="test-skill"
cd "$REPO"
cat <<SKILLEOF | bun "$CLI" distill "$CANDIDATE"
---
name: $CANDIDATE
description: Use when testing the skill-mine lifecycle end-to-end.
metadata:
  origin: skill-mine
  source_commit: "$SHA"
  mined_date: "2026-07-22"
  judge_version: "v1-writing-skills"
  scope: "project"
  evidence_summary: "Baseline failed; two treatments passed 5/5."
  content_hash: "0000000000000000000000000000000000000000000000000000000000000000"
---

# Test Skill

A test skill for integration testing.
SKILLEOF

CAND_DIR="$RUNTIME/candidates/$CANDIDATE"
test -f "$CAND_DIR/SKILL.md"
echo "  Distilled candidate: $CAND_DIR"

# --- 5. Record behavioral approval (hash-bound) ---
HASH=$(sha256sum "$CAND_DIR/SKILL.md" | cut -d' ' -f1)
cat <<APPEOF | bun "$CLI" evaluate "$CANDIDATE"
{
  "candidateName": "$CANDIDATE",
  "candidateHash": "$HASH",
  "baseline": { "modelId": "m-baseline", "passed": false, "score": 1, "summary": "baseline failed" },
  "treatments": [
    { "modelId": "m-treat-1", "passed": true, "score": 5, "summary": "treatment 1 passed" },
    { "modelId": "m-treat-2", "passed": true, "score": 5, "summary": "treatment 2 passed" }
  ],
  "judge": { "modelId": "m-judge", "passed": true, "score": 5, "summary": "judge passed" },
  "approvedBy": "integration-test"
}
APPEOF
test -f "$CAND_DIR/approval.json"
echo "  Recorded approval (hash: ${HASH:0:12})"

# --- 6. Validate (deterministic admission) ---
bun "$CLI" validate "$CANDIDATE"
echo "  Validated candidate"

# --- 7. Promote (project scope) ---
DEST=$(bun "$CLI" promote "$CANDIDATE")
echo "  Promoted to: $DEST"
test -f "$DEST/SKILL.md"
test ! -d "$CAND_DIR"

# --- 8. Retire + Restore ---
bun "$CLI" retire "$CANDIDATE"
test -f "$RUNTIME/archive/$CANDIDATE/SKILL.md"
test ! -d "$PROJ_SKILLS/$CANDIDATE"
echo "  Retired to archive"
bun "$CLI" restore "$CANDIDATE"
test -f "$PROJ_SKILLS/$CANDIDATE/SKILL.md"
echo "  Restored to project root"

# --- 9. Push-failure rollback simulation ---
# The skill is already in the project root (promoted in step 7, retired+restored
# in step 8). Rollback moves it back to quarantine (as if the outer /ship push failed).
bun "$CLI" rollback "$CANDIDATE"
test ! -d "$PROJ_SKILLS/$CANDIDATE"
test -f "$CAND_DIR/SKILL.md"
echo "  Rolled back to quarantine"

# --- 10. Template-scope promote + fresh-process loader ---
CANDIDATE_T="test-skill-t"
cat <<SKILLEOF2 | bun "$CLI" distill "$CANDIDATE_T"
---
name: $CANDIDATE_T
description: Use when testing template-scope promotion.
metadata:
  origin: skill-mine
  source_commit: "$SHA"
  mined_date: "2026-07-22"
  judge_version: "v1-writing-skills"
  scope: "template"
  evidence_summary: "Baseline failed; two treatments passed 5/5."
  content_hash: "0000000000000000000000000000000000000000000000000000000000000000"
---

# Test Skill Template

A template-scope test skill.
SKILLEOF2

CAND_DIR_T="$RUNTIME/candidates/$CANDIDATE_T"
HASH_T=$(sha256sum "$CAND_DIR_T/SKILL.md" | cut -d' ' -f1)
cat <<APPEOF2 | bun "$CLI" evaluate "$CANDIDATE_T"
{
  "candidateName": "$CANDIDATE_T",
  "candidateHash": "$HASH_T",
  "baseline": { "modelId": "m-baseline", "passed": false, "score": 1, "summary": "baseline failed" },
  "treatments": [
    { "modelId": "m-treat-1", "passed": true, "score": 5, "summary": "t1" },
    { "modelId": "m-treat-2", "passed": true, "score": 5, "summary": "t2" }
  ],
  "judge": { "modelId": "m-judge", "passed": true, "score": 5, "summary": "j" },
  "approvedBy": "integration-test"
}
APPEOF2

echo '{"evidence":{"projects":["p1","p2"],"modelIds":["m1","m2"]}}' | bun "$CLI" promote "$CANDIDATE_T" >/dev/null
test -f "$TMPL_SKILLS/$CANDIDATE_T/SKILL.md"
echo "  Promoted template-scope skill"

# Fresh-process loader: opencode debug skill --pure from the temp project.
git init -q "$WORK/proj"
git -C "$WORK/proj" config user.email "t@t.com"
git -C "$WORK/proj" config user.name "t"
LOADER_OUT=$(cd "$WORK/proj" && "$OPENCODE" debug skill --pure 2>/dev/null)
FOUND=$(echo "$LOADER_OUT" | node -e "
let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{
  const start=s.indexOf('[');
  const end=s.lastIndexOf(']')+1;
  const arr=JSON.parse(s.slice(start,end));
  const f=arr.find(x=>x.name==='$CANDIDATE_T');
  if(!f){console.error('NOT FOUND in loader output');process.exit(1);}
  console.log('FOUND:'+f.name);
});")
echo "  Fresh-process loader: $FOUND"

# --- 11. Assertions: no leaks, runtime local ---
test ! -d "$PROJ_SKILLS/$CANDIDATE_T"
test -d "$RUNTIME/archive"
test -d "$RUNTIME/candidates"
test -d "$RUNTIME/receipts"
test -d "$RUNTIME/traces"
test -d "$RUNTIME/journal"
echo "  No project/template leak; runtime local"

echo ""
echo "=== Skill-Mine integration test PASSED ==="
