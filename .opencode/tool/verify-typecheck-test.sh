#!/usr/bin/env bash
# verify-typecheck-test.sh — Isolated regression test for the semantic-typecheck
# gate in verify.sh.
#
# Builds throwaway fixtures in mktemp -d and runs copies of verify.sh against
# stubbed toolchains. NEVER mutates the checkout's real compiler or node_modules.
#
# Cases:
#   1. compiler present + exits 0       -> typecheck PASS, final exit 0
#   2. compiler present + exits 1       -> typecheck FAIL (+ diagnostic), exit 1
#   3. compiler absent + package.json  -> SKIP + "npm ci --prefix .opencode", exit 0
#   4. compiler absent + no package.json-> SKIP + dev-repo note (no install hint), exit 0
#
# Also asserts: the compiler is invoked with "--noEmit -p .opencode/tsconfig.json";
# skipped runs disclose a skipped check in the summary.

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REAL_VERIFY="$SCRIPT_DIR/verify.sh"

FAILURES=0
FIXTURES=()
cleanup() {
  for f in "${FIXTURES[@]}"; do [ -e "$f" ] && rm -r "$f" 2>/dev/null; done
}
trap cleanup EXIT

section() { printf '\n--- %s ---\n' "$1"; }
ok()      { printf '  PASS: %s\n' "$1"; }
bad()     { printf '  FAIL: %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

assert_contains() { # <haystack> <needle> <label>
  if [[ "$1" == *"$2"* ]]; then ok "$3"; else bad "$3 (missing: $2)"; fi
}
assert_not_contains() { # <haystack> <needle> <label>
  if [[ "$1" == *"$2"* ]]; then bad "$3 (unexpected: $2)"; else ok "$3"; fi
}
assert_exit() { # <got> <want> <label>
  if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got $1, want $2)"; fi
}

# build_fixture <tsc_stub_body|"" > <has_package_json yes|no>  -> echoes fixture root
build_fixture() {
  local tsc_body="$1" has_pkg="$2" fx
  fx="$(mktemp -d)"
  FIXTURES+=("$fx")
  mkdir -p "$fx/.opencode/tool" "$fx/.opencode/plugin" "$fx/.opencode/node_modules/.bin" "$fx/stubs"

  cp "$REAL_VERIFY" "$fx/.opencode/tool/verify.sh"

  cat > "$fx/.opencode/tool/structural-check.sh" <<'SH'
#!/usr/bin/env bash
echo "[OK] All structural checks passed."
exit 0
SH
  chmod +x "$fx/.opencode/tool/structural-check.sh"

  printf '#!/usr/bin/env bash\nexit 0\n' > "$fx/stubs/opencode"
  printf '#!/usr/bin/env bash\nexit 0\n' > "$fx/stubs/git"
  chmod +x "$fx/stubs/opencode" "$fx/stubs/git"

  if [ "$has_pkg" = "yes" ]; then printf '{}\n' > "$fx/.opencode/package.json"; fi

  if [ -n "$tsc_body" ]; then
    printf '%s\n' "$tsc_body" > "$fx/.opencode/node_modules/.bin/tsc"
    chmod +x "$fx/.opencode/node_modules/.bin/tsc"
  fi

  echo "$fx"
}

# make_tsc_stub <exit_code> -> stub body that records argv to $TSC_LOG
make_tsc_stub() {
  cat <<SH
#!/usr/bin/env bash
printf '%s\n' "\$*" >> "\$TSC_LOG"
if [ "$1" != "0" ]; then
  echo "error TS9999: synthetic typecheck failure sentinel"
fi
exit $1
SH
}

run_in_fixture() { # <fixture> -> sets OUT + RC
  local fx="$1"
  OUT="$( cd "$fx" && PATH="$fx/stubs:$PATH" npm_config_offline=true bash .opencode/tool/verify.sh 2>&1 )"
  RC=$?
}

# --- Case 1: compiler present, exits 0 -> PASS, exit 0 ---
section "Case 1: compiler present, exits 0 -> PASS"
fx="$(build_fixture "$(make_tsc_stub 0)" no)"
export TSC_LOG="$fx/tsc-args.log"
run_in_fixture "$fx"
assert_contains "$OUT" "TypeScript semantic typecheck" "typecheck header present"
assert_contains "$OUT" "PASS: semantic typecheck clean" "typecheck PASS marker"
assert_contains "$(cat "$TSC_LOG" 2>/dev/null)" "--noEmit -p .opencode/tsconfig.json" "exact compiler args"
assert_exit "$RC" 0 "exit 0"
unset TSC_LOG

# --- Case 2: compiler present, exits 1 -> FAIL + diagnostic, exit 1 ---
section "Case 2: compiler present, exits 1 -> FAIL + diagnostic"
fx="$(build_fixture "$(make_tsc_stub 1)" no)"
export TSC_LOG="$fx/tsc-args.log"
run_in_fixture "$fx"
assert_contains "$OUT" "TypeScript semantic typecheck" "typecheck header present"
assert_contains "$OUT" "FAIL: semantic typecheck" "typecheck FAIL marker"
assert_contains "$OUT" "synthetic typecheck failure sentinel" "diagnostic forwarded"
assert_exit "$RC" 1 "exit 1"
unset TSC_LOG

# --- Case 3: compiler absent + package.json -> SKIP + npm ci hint, exit 0 ---
section "Case 3: compiler absent + package.json -> SKIP + npm ci hint"
fx="$(build_fixture "" yes)"
run_in_fixture "$fx"
assert_contains "$OUT" "TypeScript semantic typecheck" "typecheck header present"
assert_contains "$OUT" "SKIP: semantic typecheck" "typecheck SKIP marker"
assert_contains "$OUT" "npm ci --prefix .opencode" "install hint present"
assert_not_contains "$OUT" "dev-repo" "no dev-repo note when package.json present"
assert_contains "$OUT" "skipped" "summary discloses skipped check"
assert_exit "$RC" 0 "exit 0"

# --- Case 4: compiler absent + no package.json -> SKIP + dev-repo note, exit 0 ---
section "Case 4: compiler absent + no package.json -> SKIP + dev-repo note"
fx="$(build_fixture "" no)"
run_in_fixture "$fx"
assert_contains "$OUT" "TypeScript semantic typecheck" "typecheck header present"
assert_contains "$OUT" "SKIP: semantic typecheck" "typecheck SKIP marker"
assert_contains "$OUT" "dev-repo" "dev-repo note present"
assert_not_contains "$OUT" "npm ci --prefix" "no install hint without package.json"
assert_contains "$OUT" "skipped" "summary discloses skipped check"
assert_exit "$RC" 0 "exit 0"

# --- Summary ---
printf '\n---\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '[OK] All typecheck regression cases passed.\n'
  exit 0
else
  printf '[FAIL] %d typecheck regression assertion(s) failed.\n' "$FAILURES"
  exit 1
fi
