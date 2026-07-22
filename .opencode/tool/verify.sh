#!/usr/bin/env bash
# verify.sh — Deterministic offline verification runner for the OpenCode template.
#
# No network, no cache, no auto-fix. Fixed-order checks with truthful per-check
# PASS/FAIL. Exit 0 only if every check passes; 1 if any fail. Read the output.
#
# Checks: (1) config validation, (2) structural invariants,
#         (3) Bun compile smoke, (4) git diff whitespace.
#
# Bun compile smoke is NOT a semantic typecheck — `typescript` is not a
# dependency. It catches syntax and import-resolution errors only. Do not
# relabel it as typecheck.

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
FAILURES=0

section() { printf '\n=== %s ===\n' "$1"; }
ok()      { printf '  PASS: %s\n' "$1"; }
bad()     { printf '  FAIL: %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

# --- 1. Config validation ---
section "Check 1/4: Config validation"
if command -v opencode >/dev/null 2>&1; then
  if OPENCODE_PURE=1 opencode debug config >/dev/null 2>&1; then
    ok "opencode debug config --pure resolves merged config"
  else
    bad "opencode debug config --pure failed (invalid config)"
  fi
else
  if bun -e 'JSON.parse(require("fs").readFileSync(".opencode/opencode.json","utf8"))' >/dev/null 2>&1; then
    ok "opencode.json parses (opencode binary missing — schema validation skipped)"
  else
    bad "opencode.json failed to parse"
  fi
fi

# --- 2. Structural invariants ---
section "Check 2/4: Structural invariants (structural-check.sh)"
out="$(bash .opencode/tool/structural-check.sh 2>&1)"
rc=$?
printf '%s\n' "$out"
if [ "$rc" -ne 0 ]; then
  bad "structural-check.sh exited $rc"
else
  ok "structural-check.sh clean"
fi

# --- 3. Bun compile smoke (syntax + import resolution; NOT typecheck) ---
section "Check 3/4: Bun compile smoke (syntax/import resolution — not typecheck)"
COMPILE_FAIL=0
while IFS= read -r -d '' f; do
  case "$f" in *.d.ts) continue ;; esac
  if ! bun build "$f" --target bun --outfile /dev/null --external @opencode-ai/plugin >/dev/null 2>&1; then
    bad "bun build failed: ${f#"$ROOT"/}"
    COMPILE_FAIL=1
  fi
done < <(find .opencode/plugin .opencode/tool -name '*.ts' -type f -print0 2>/dev/null | sort -z)
[ "$COMPILE_FAIL" -eq 0 ] && ok "all plugin/tool .ts compile"

# --- 4. git diff whitespace / conflict markers ---
section "Check 4/4: git diff whitespace"
if git diff --check >/dev/null 2>&1; then
  ok "no whitespace/conflict errors"
else
  bad "git diff --check found whitespace/conflict errors"
fi

# --- Summary ---
printf '\n---\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '[OK] All verification checks passed.\n'
  exit 0
else
  printf '[FAIL] %d check(s) failed.\n' "$FAILURES"
  exit 1
fi
