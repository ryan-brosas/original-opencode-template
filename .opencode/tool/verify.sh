#!/usr/bin/env bash
# verify.sh — Deterministic offline verification runner for the OpenCode template.
#
# No network, no cache, no auto-fix. Fixed-order checks with truthful per-check
# PASS/FAIL/SKIP. Exit 0 only if no check fails (SKIPs do not fail); 1 if any
# check fails. Read the output.
#
# Checks: (1) config validation, (2) structural invariants,
#         (3) Bun compile smoke, (4) TypeScript semantic typecheck,
#         (5) git diff whitespace.
#
# Bun compile smoke (check 3) catches syntax + import resolution; it is distinct
# from the semantic typecheck (check 4), which runs the pinned local tsc when
# present and SKIPs otherwise (consumer templates ship without the compiler).

set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
FAILURES=0
SKIPS=0

section() { printf '\n=== %s ===\n' "$1"; }
ok()      { printf '  PASS: %s\n' "$1"; }
bad()     { printf '  FAIL: %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
skip()    { printf '  SKIP: %s\n' "$1"; SKIPS=$((SKIPS + 1)); }

# --- 1. Config validation ---
section "Check 1/5: Config validation"
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
section "Check 2/5: Structural invariants (structural-check.sh)"
out="$(bash .opencode/tool/structural-check.sh 2>&1)"
rc=$?
printf '%s\n' "$out"
if [ "$rc" -ne 0 ]; then
  bad "structural-check.sh exited $rc"
else
  ok "structural-check.sh clean"
fi

# --- 3. Bun compile smoke (syntax + import resolution) ---
section "Check 3/5: Bun compile smoke (syntax/import resolution)"
COMPILE_FAIL=0
while IFS= read -r -d '' f; do
  case "$f" in *.d.ts) continue ;; esac
  if ! bun build "$f" --target bun --outfile /dev/null --external @opencode-ai/plugin >/dev/null 2>&1; then
    bad "bun build failed: ${f#"$ROOT"/}"
    COMPILE_FAIL=1
  fi
done < <(find .opencode/plugin .opencode/tool -name '*.ts' -type f -print0 2>/dev/null | sort -z)
[ "$COMPILE_FAIL" -eq 0 ] && ok "all plugin/tool .ts compile"

# --- 4. TypeScript semantic typecheck ---
# Uses the pinned nested compiler directly (never bare/npx) so the gate stays
# offline and deterministic. SKIPs honestly when the compiler is absent, so a
# consumer template (which ships without the manifest/lockfile) does not fail.
section "Check 4/5: TypeScript semantic typecheck"
TSC="$ROOT/.opencode/node_modules/.bin/tsc"
if [ -x "$TSC" ]; then
  tsc_out="$("$TSC" --noEmit -p .opencode/tsconfig.json 2>&1)"
  tsc_rc=$?
  if [ "$tsc_rc" -eq 0 ]; then
    ok "semantic typecheck clean"
  else
    bad "semantic typecheck (tsc exited $tsc_rc)"
    while IFS= read -r line; do [ -n "$line" ] && printf '    %s\n' "$line"; done <<< "$tsc_out"
  fi
else
  if [ -f "$ROOT/.opencode/package.json" ]; then
    skip "semantic typecheck — typescript not installed; run: npm ci --prefix .opencode"
  else
    skip "semantic typecheck — dev-repo only (no package manifest)"
  fi
fi

# --- 5. git diff whitespace / conflict markers ---
section "Check 5/5: git diff whitespace"
if git diff --check >/dev/null 2>&1; then
  ok "no whitespace/conflict errors"
else
  bad "git diff --check found whitespace/conflict errors"
fi

# --- Summary ---
printf '\n---\n'
if [ "$FAILURES" -eq 0 ]; then
  if [ "$SKIPS" -gt 0 ]; then
    printf '[OK] All verification checks passed (%d skipped).\n' "$SKIPS"
  else
    printf '[OK] All verification checks passed.\n'
  fi
  exit 0
else
  printf '[FAIL] %d check(s) failed (%d skipped).\n' "$FAILURES" "$SKIPS"
  exit 1
fi
