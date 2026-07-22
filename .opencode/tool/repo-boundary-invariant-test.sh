#!/usr/bin/env bash
# repo-boundary-invariant-test.sh — Isolated regression test for the repo
# boundary invariant in structural-check.sh (Check 7).
#
# Builds throwaway fixtures under one mktemp -d root, copies the REAL
# structural-check.sh into each, and runs it against opencode.json files with
# varying permission.external_directory values. NEVER mutates the checkout's
# real opencode.json.
#
# Cases (all run the real structural-check.sh against a fixture config):
#   1. external_directory = "deny"     -> structural-check exit 0 (+ PASS marker)
#   2. external_directory = "ask"      -> structural-check exit 1 (no PASS)
#   3. external_directory = "allow"    -> structural-check exit 1 (no PASS)
#   4. permission present, field gone  -> structural-check exit 1 (no PASS)
#   5. opencode.json missing           -> structural-check exit 1 (no PASS)
#   6. malformed JSON                 -> structural-check exit 1 (no PASS)
#   7. external_directory = ["deny"]   -> structural-check exit 1 (no PASS) — array must NOT stringify to "deny"
#   8. bun present but errors          -> structural-check exit 1 (no PASS) — fail closed on parse/eval error
#
# Run: bash .opencode/tool/repo-boundary-invariant-test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REAL_STRUCTURAL="$SCRIPT_DIR/structural-check.sh"

FAILURES=0
FX_N=0

# One top-level temp root; build_fixture runs in the current shell so it can
# write here directly (command substitution would lose FIXTURES state).
TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

section() { printf '\n--- %s ---\n' "$1"; }
ok()      { printf '  PASS: %s\n' "$1"; }
bad()     { printf '  FAIL: %s\n' "$1"; FAILURES=$((FAILURES + 1)); }

assert_exit() { # <got> <want> <label>
  if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got exit $1, want $2)"; fi
}
assert_contains() { # <haystack> <needle> <label>
  if [[ "$1" == *"$2"* ]]; then ok "$3"; else bad "$3 (missing: $2)"; fi
}
assert_not_contains() { # <haystack> <needle> <label>
  if [[ "$1" == *"$2"* ]]; then bad "$3 (unexpected: $2)"; else ok "$3"; fi
}

# build_fixture <opencode-json-content|"" for missing> [stub_bun: yes|no]
# Runs in the CURRENT shell, creates the fixture under $TMPROOT, and sets the
# global LAST_FX to the fixture root. (Returning via echo would run in a
# subshell and lose FX_N increments, colliding every fixture into one dir.)
build_fixture() {
  local cfg="$1" stub_bun="${2:-no}" fx
  FX_N=$((FX_N + 1))
  fx="$TMPROOT/fx-$FX_N"
  mkdir -p "$fx/.opencode/tool" "$fx/.opencode/plugin" "$fx/.opencode/command" "$fx/stubs"

  cp "$REAL_STRUCTURAL" "$fx/.opencode/tool/structural-check.sh"
  chmod +x "$fx/.opencode/tool/structural-check.sh"

  # Minimal valid plugin + command so checks 1-5 operate on real, passing files.
  printf '// dummy plugin for boundary invariant fixture\n' > "$fx/.opencode/plugin/dummy.ts"
  printf '# dummy command\n' > "$fx/.opencode/command/dummy.md"

  # Stub npx so Check 6 (fallow probe) is fast and does not fetch anything.
  printf '#!/usr/bin/env bash\nexit 1\n' > "$fx/stubs/npx"
  chmod +x "$fx/stubs/npx"

  # Optionally stub bun to exit 1 (fail-closed on bun eval error).
  if [ "$stub_bun" = "yes" ]; then
    printf '#!/usr/bin/env bash\nexit 1\n' > "$fx/stubs/bun"
    chmod +x "$fx/stubs/bun"
  fi

  if [ "$cfg" != "" ]; then printf '%s\n' "$cfg" > "$fx/.opencode/opencode.json"; fi
  LAST_FX="$fx"
}

run_in_fixture() { # <fixture> -> sets OUT + RC
  local fx="$1"
  OUT="$( cd "$fx" && PATH="$fx/stubs:$PATH" bash .opencode/tool/structural-check.sh 2>&1 )"
  RC=$?
}

DENY_CFG='{"$schema":"https://opencode.ai/config.json","permission":{"external_directory":"deny"}}'
ASK_CFG='{"$schema":"https://opencode.ai/config.json","permission":{"external_directory":"ask"}}'
ALLOW_CFG='{"$schema":"https://opencode.ai/config.json","permission":{"external_directory":"allow"}}'
NOFIELD_CFG='{"$schema":"https://opencode.ai/config.json","permission":{"edit":"allow"}}'
ARRAY_CFG='{"$schema":"https://opencode.ai/config.json","permission":{"external_directory":["deny"]}}'
MALFORMED_CFG='{ this is not valid json'

# --- Case 1: deny -> exit 0 + PASS ---
section "Case 1: external_directory=deny -> structural-check exit 0"
build_fixture "$DENY_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "Check 7/7" "Check 7 present"
assert_contains "$OUT" "external_directory is deny" "deny PASS marker"
assert_exit "$RC" 0 "exit 0"

# --- Case 2: ask -> exit 1, no PASS ---
section "Case 2: external_directory=ask -> structural-check exit 1"
build_fixture "$ASK_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "external_directory" "boundary check ran"
assert_not_contains "$OUT" "external_directory is deny" "no misleading deny PASS"
assert_exit "$RC" 1 "exit 1"

# --- Case 3: allow -> exit 1, no PASS ---
section "Case 3: external_directory=allow -> structural-check exit 1"
build_fixture "$ALLOW_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "external_directory" "boundary check ran"
assert_not_contains "$OUT" "external_directory is deny" "no misleading deny PASS"
assert_exit "$RC" 1 "exit 1"

# --- Case 4: permission present, field gone -> exit 1, no PASS ---
section "Case 4: external_directory field missing -> structural-check exit 1"
build_fixture "$NOFIELD_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "external_directory" "boundary check ran"
assert_not_contains "$OUT" "external_directory is deny" "no misleading deny PASS"
assert_exit "$RC" 1 "exit 1"

# --- Case 5: opencode.json missing -> exit 1, no PASS ---
section "Case 5: opencode.json missing -> structural-check exit 1"
build_fixture ""; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "opencode.json missing" "missing-config message"
assert_not_contains "$OUT" "external_directory is deny" "no misleading deny PASS"
assert_exit "$RC" 1 "exit 1"

# --- Case 6: malformed JSON -> exit 1, no PASS (fail closed on parse error) ---
section "Case 6: malformed JSON -> structural-check exit 1"
build_fixture "$MALFORMED_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_contains "$OUT" "external_directory" "boundary check ran"
assert_not_contains "$OUT" "external_directory is deny" "no misleading deny PASS"
assert_exit "$RC" 1 "exit 1"

# --- Case 7: array ["deny"] -> exit 1, no PASS (array must NOT stringify to deny) ---
section "Case 7: external_directory=[\"deny\"] -> structural-check exit 1"
build_fixture "$ARRAY_CFG"; fx="$LAST_FX"
run_in_fixture "$fx"
assert_not_contains "$OUT" "external_directory is deny" "array does NOT pass as deny"
assert_exit "$RC" 1 "exit 1"

# --- Case 8: bun present but errors -> exit 1, no PASS (fail closed on eval error) ---
section "Case 8: bun errors -> structural-check exit 1"
build_fixture "$DENY_CFG" yes; fx="$LAST_FX"
run_in_fixture "$fx"
assert_not_contains "$OUT" "external_directory is deny" "no deny PASS when bun errors"
assert_exit "$RC" 1 "exit 1"

# --- Summary ---
printf '\n---\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '[OK] All repo-boundary invariant cases passed.\n'
  exit 0
else
  printf '[FAIL] %d repo-boundary invariant assertion(s) failed.\n' "$FAILURES"
  exit 1
fi
