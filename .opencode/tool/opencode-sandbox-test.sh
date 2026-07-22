#!/usr/bin/env bash
# opencode-sandbox-test.sh — Test the fail-closed bubblewrap launcher.
#
# Three layers (all self-contained; never touches a real sibling/user repo):
#   A. FAKE-BWRAP CONTRACT — a fake bwrap records the launcher's argv; assert
#      the mount-namespace policy (hardening flags, synthetic mounts, system RO,
#      workspace RW, NO broad host/parent binds, chdir, marker env, child).
#   B. PREFLIGHT FAIL-CLOSED — launcher rejects bad inputs WITHOUT invoking
#      bwrap (missing bwrap, broken bwrap, broad root, non-git, linked worktree,
#      symlinked state dir).
#   C. REAL-BWRAP CONTAINMENT — uses the REAL /usr/bin/bwrap on an isolated
#      fixture (independent git workspace + fixture sibling). Proves the
#      workspace is RW and the fixture sibling is INVISIBLE inside the ns.
#      Gated on a bwrap-functional probe; SKIPPED (not failed) if bwrap cannot
#      create namespaces (e.g. non-setuid bwrap + kernel blocks unprivileged
#      userns). Run `sudo chmod u+s /usr/bin/bwrap` to enable, then re-run.
#
# Run: bash .opencode/tool/opencode-sandbox-test.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCHER="$SCRIPT_DIR/opencode-sandbox.sh"

FAILURES=0
SKIPS=0
TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

section() { printf '\n--- %s ---\n' "$1"; }
ok()      { printf '  PASS: %s\n' "$1"; }
bad()     { printf '  FAIL: %s\n' "$1"; FAILURES=$((FAILURES + 1)); }
skip()    { printf '  SKIP: %s\n' "$1"; SKIPS=$((SKIPS + 1)); }
assert_exit() { if [ "$1" = "$2" ]; then ok "$3"; else bad "$3 (got $1, want $2)"; fi; }
assert_contains()  { if [[ "$1" == *"$2"* ]]; then ok "$3"; else bad "$3 (missing: $2)"; fi; }
assert_not_contains() { if [[ "$1" == *"$2"* ]]; then bad "$3 (unexpected: $2)"; else ok "$3"; fi; }

# ---- shared fake bwrap (records argv to $BWRAP_LOG, exits $FAKE_BWRAP_RC) ----
make_fake_bwrap() { # <path> <exit-code>
  local path="$1" rc="$2"
  printf '#!/usr/bin/env bash\n' > "$path"
  printf 'printf "%%s\\0" "$@" >> "%s"\n' "$BWRAP_LOG" >> "$path"
  printf 'printf "\\0" >> "%s"\n' "$BWRAP_LOG" >> "$path"   # record separator
  printf 'exit %s\n' "$rc" >> "$path"
  chmod +x "$path"
}

# run_launcher <env-assignments...> -- <workspace> [child-args...]
#   The first arg after `--` is the workspace (passed as --workspace <dir> to
#   the launcher); remaining args are forwarded as child args.
run_launcher() {
  local envs=()
  while [ "$1" != "--" ]; do envs+=("$1"); shift; done
  shift
  local ws="$1"; shift
  OUT="$( env "${envs[@]}" "$LAUNCHER" --workspace "$ws" "$@" 2>&1 )"
  RC=$?
}

# ======================================================================
# A. FAKE-BWRAP CONTRACT
# ======================================================================
section "A. Fake-bwrap contract (argv policy)"
BWRAP_LOG="$TMPROOT/contract.log"; : > "$BWRAP_LOG"
FAKE_BWRAP="$TMPROOT/fake-bwrap"; make_fake_bwrap "$FAKE_BWRAP" 0

# A distinct child so we can assert it appears after the final --.
CHILD="$TMPROOT/probe-child"
printf '#!/usr/bin/env bash\nexit 0\n' > "$CHILD"; chmod +x "$CHILD"

WS="$TMPROOT/workspace"; mkdir -p "$WS"; git -C "$WS" init -q
run_launcher \
  "OPENCODE_SANDBOX_BWRAP=$FAKE_BWRAP" \
  "OPENCODE_SANDBOX_CHILD=$CHILD" \
  "OPENCODE_SANDBOX_ENV_ALLOW=PATH" \
  -- "$WS"
LOG="$(tr '\0' ' ' < "$BWRAP_LOG")"

assert_exit "$RC" 0 "launcher invokes fake-bwrap successfully"
# hardening flags (present in both the preflight probe and the real launch)
assert_contains "$LOG" "--unshare-user"       "policy: --unshare-user (child drops to non-root)"
assert_contains "$LOG" "--unshare-all"        "policy: --unshare-all"
assert_contains "$LOG" "--share-net"          "policy: --share-net"
assert_contains "$LOG" "--new-session"        "policy: --new-session"
assert_contains "$LOG" "--die-with-parent"   "policy: --die-with-parent"
assert_contains "$LOG" "--clearenv"           "policy: --clearenv"
# synthetic mounts
assert_contains "$LOG" "--proc /proc"         "policy: --proc /proc"
assert_contains "$LOG" "--dev /dev"           "policy: --dev /dev"
assert_contains "$LOG" "--tmpfs /tmp"         "policy: --tmpfs /tmp"
# system RO substrate
assert_contains "$LOG" "--ro-bind /usr /usr"   "policy: /usr mounted RO"
# workspace RW at canonical path
assert_contains "$LOG" "--bind $WS $WS"       "policy: workspace RW at canonical path"
assert_contains "$LOG" "--chdir $WS"          "policy: --chdir workspace"
# marker env (liveness for the startup plugin — NOT a security boundary)
assert_contains "$LOG" "--setenv OPENCODE_SANDBOX_ROOT $WS" "policy: liveness marker env set"
# the child appears as the final command (after the last --)
assert_contains "$LOG" "-- $CHILD"            "policy: child command after final --"
# MUST NOT mount broad host roots (the whole point)
assert_not_contains "$LOG" "--bind / /"      "no broad bind of /"
assert_not_contains "$LOG" "--ro-bind / /"   "no broad ro-bind of /"
assert_not_contains "$LOG" "--bind ${HOME} ${HOME}" "no bind of \$HOME"
assert_not_contains "$LOG" "--ro-bind ${HOME} ${HOME}" "no ro-bind of \$HOME"
assert_not_contains "$LOG" "--dev-bind / /"   "no dev-bind of /"
# MUST NOT expose host /etc wholesale (synthetic /etc only; no /etc/opencode leak)
assert_not_contains "$LOG" "--ro-bind /etc /etc"      "no wholesale /etc bind"
assert_not_contains "$LOG" "--bind /etc /etc"         "no RW /etc bind"

# ======================================================================
# B. PREFLIGHT FAIL-CLOSED (launcher exits nonzero, bwrap not reached)
# ======================================================================
section "B. Preflight fail-closed"
# Sentinel created by a "bad child" if the launcher ever runs it unsandboxed.
BAD_CHILD="$TMPROOT/bad-child"
printf '#!/usr/bin/env bash\ntouch "%s"\nexit 0\n' "$TMPROOT/child-ran" > "$BAD_CHILD"; chmod +x "$BAD_CHILD"
GOOD_BWRAP="$TMPROOT/good-bwrap"; make_fake_bwrap "$GOOD_BWRAP" 0

# P1: bwrap missing
: > "$BWRAP_LOG"
run_launcher "OPENCODE_SANDBOX_BWRAP=$TMPROOT/does-not-exist" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$WS"
assert_exit "$RC" 1 "P1: missing bwrap -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P1: child ran despite missing bwrap" || ok "P1: child never ran"

# P2: bwrap broken (probe fails)
BROKEN_BWRAP="$TMPROOT/broken-bwrap"; make_fake_bwrap "$BROKEN_BWRAP" 1
run_launcher "OPENCODE_SANDBOX_BWRAP=$BROKEN_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$WS"
assert_exit "$RC" 1 "P2: broken bwrap -> exit 1"

# P3: workspace == /
: > "$BWRAP_LOG"
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "/"
assert_exit "$RC" 1 "P3: workspace == / -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P3: child ran" || ok "P3: child never ran"

# P4: workspace == $HOME
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$HOME"
assert_exit "$RC" 1 "P4: workspace == \$HOME -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P4: child ran" || ok "P4: child never ran"

# P5: workspace is an ancestor of $HOME (contains home -> would expose siblings)
ANC="$TMPROOT/ancestor-home"; mkdir -p "$ANC"; git -C "$ANC" init -q
HOME_UNDER="$ANC/ryan/home"; mkdir -p "$HOME_UNDER"
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" "HOME=$HOME_UNDER" -- "$ANC"
assert_exit "$RC" 1 "P5: workspace ancestor of \$HOME -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P5: child ran" || ok "P5: child never ran"

# P6: not a git repo
NONGIT="$TMPROOT/nongit"; mkdir -p "$NONGIT"
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$NONGIT"
assert_exit "$RC" 1 "P6: non-git workspace -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P6: child ran" || ok "P6: child never ran"

# P7: linked worktree (.git is a file gitfile)
WT="$TMPROOT/worktree"; mkdir -p "$WT"
printf "gitdir: %s/elsewhere\n" "$TMPROOT" > "$WT/.git"
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$WT"
assert_exit "$RC" 1 "P7: linked worktree (.git gitfile) -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P7: child ran" || ok "P7: child never ran"

# P8: state dir is a symlink -> reject (poisoned state redirect)
STATEDIR_WS="$TMPROOT/state-ws"; mkdir -p "$STATEDIR_WS"; git -C "$STATEDIR_WS" init -q
mkdir -p "$STATEDIR_WS/.opencode"
ln -s "$TMPROOT/outside" "$STATEDIR_WS/.opencode/.sandbox-state"
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" -- "$STATEDIR_WS"
assert_exit "$RC" 1 "P8: symlinked .sandbox-state -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P8: child ran" || ok "P8: child never ran"

# P9: state_dir with '..' escape -> reject (accidental parent escape)
P9WS="$TMPROOT/dotdot-ws"; mkdir -p "$P9WS"; git -C "$P9WS" init -q
rm -f "$TMPROOT/child-ran"
run_launcher "OPENCODE_SANDBOX_BWRAP=$GOOD_BWRAP" "OPENCODE_SANDBOX_CHILD=$BAD_CHILD" "OPENCODE_SANDBOX_STATE_DIR=../escaped-state" -- "$P9WS"
assert_exit "$RC" 1 "P9: state_dir with '..' -> exit 1"
[ -e "$TMPROOT/child-ran" ] && bad "P9: child ran" || ok "P9: child never ran"

# ======================================================================
# C. REAL-BWRAP CONTAINMENT (gated on bwrap being functional)
# ======================================================================
section "C. Real-bwrap containment"
# Functional probe: same hardening flags + minimal RO bind of /usr + /lib (so the
# dynamic /usr/bin/true can exec). Matches the launcher's own preflight probe.
# --disable-userns is intentionally omitted (AppArmor blocks the sysctl read for
# setuid-root bwrap on this host; nested-userns escape is a malicious vector,
# out of V1 scope).
if bwrap --unshare-user --unshare-all --share-net --new-session --die-with-parent \
       --ro-bind /usr /usr --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 \
       -- /usr/bin/true 2>/dev/null; then
  BWRAP_OK=1
else
  BWRAP_OK=0
fi

if [ "$BWRAP_OK" != "1" ]; then
  skip "real-bwrap containment (bwrap not functional — run: sudo chmod u+s /usr/bin/bwrap, then re-run)"
else
  # Isolated fixture: independent git workspace + a fixture sibling (NOT a real repo).
  CWS="$TMPROOT/cws"; mkdir -p "$CWS"; git -C "$CWS" init -q
  SIB="$TMPROOT/sibling"; mkdir -p "$SIB"; echo SECRET > "$SIB/sentinel"

  # Probe child lives INSIDE the workspace (the only host path mounted RW in the
  # namespace; /tmp is a fresh tmpfs so a child placed under $TMPROOT would not
  # exec). It receives $1=workspace, $2=tmproot-parent as forwarded child args.
  PROBE="$CWS/.probe-inside"
  cat > "$PROBE" <<'SH'
#!/usr/bin/env bash
rc=0
# R1: workspace must be writable (it is the one RW host bind)
if echo ok > "$1/cws-marker" 2>/dev/null; then echo "R1 workspace-RW: OK"; else echo "R1 workspace-RW: FAIL"; rc=1; fi
# R2: fixture sibling (outside the workspace) must be INVISIBLE — proves the
# launcher did NOT bind a broad parent/$HOME/$TMPROOT that would expose siblings
if [ -e "$2/sibling/sentinel" ]; then echo "R2 sibling-hidden: FAIL (visible!)"; rc=1; else echo "R2 sibling-hidden: OK"; fi
# R3: a RO-mounted system path must NOT be writable — proves /usr is read-only
if ( echo x > /usr/.evil-write 2>/dev/null ); then echo "R3 ro-enforced: FAIL (wrote to /usr!)"; rc=1; else echo "R3 ro-enforced: OK"; fi
exit $rc
SH
  chmod +x "$PROBE"

  # Forward $CWS and $TMPROOT as child args (after --) so the probe's $1/$2 are set.
  OUT="$( OPENCODE_SANDBOX_BWRAP=/usr/bin/bwrap OPENCODE_SANDBOX_CHILD="$PROBE" OPENCODE_SANDBOX_ENV_ALLOW=PATH "$LAUNCHER" --workspace "$CWS" -- "$CWS" "$TMPROOT" 2>&1 )"
  RC=$?
  assert_contains "$OUT" "R1 workspace-RW: OK"   "R1: workspace is RW inside the namespace"
  assert_contains "$OUT" "R2 sibling-hidden: OK"  "R2: fixture sibling is invisible inside"
  assert_contains "$OUT" "R3 ro-enforced: OK"       "R3: /usr is read-only inside the namespace"
  assert_exit "$RC" 0 "C: containment probe child exited 0"

  # R4: a child OUTSIDE the workspace (and outside mounted RO roots) must still
  # exec — proves the launcher binds the resolved child into the namespace
  # (the real opencode lives under $HOME, which is never mounted). The child is
  # placed under $TMPROOT (NOT the workspace, NOT /usr) so it is only reachable
  # via the launcher's --ro-bind of CHILD_ABS.
  EXTCHILD="$TMPROOT/ext-dir/external-child"
  mkdir -p "$(dirname "$EXTCHILD")"
  printf '#!/usr/bin/env bash\necho EXTCHILD_RAN_OK\n' > "$EXTCHILD"; chmod +x "$EXTCHILD"
  OUT="$( OPENCODE_SANDBOX_BWRAP=/usr/bin/bwrap OPENCODE_SANDBOX_CHILD="$EXTCHILD" OPENCODE_SANDBOX_ENV_ALLOW=PATH "$LAUNCHER" --workspace "$CWS" 2>&1 )"
  RC=$?
  assert_contains "$OUT" "EXTCHILD_RAN_OK" "R4: external child (outside workspace) execs inside the namespace"
  assert_exit "$RC" 0 "R4: external child exited 0"
fi

# ---- Summary ----
printf '\n---\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '[OK] opencode-sandbox tests passed (%d skipped).\n' "$SKIPS"
  exit 0
else
  printf '[FAIL] %d assertion(s) failed (%d skipped).\n' "$FAILURES" "$SKIPS"
  exit 1
fi
