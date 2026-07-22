#!/usr/bin/env bash
# opencode-sandbox.sh — Fail-closed bubblewrap launcher for OpenCode.
#
# Wraps OpenCode (and all its descendants) in an empty mount namespace that
# exposes only an explicit RO runtime substrate and the active workspace RW.
# Other user projects/folders (sibling repos, $HOME contents) are simply never
# mounted, so they are invisible — accidental path drift is impossible.
#
# SECURITY MODEL:
#   - The LAUNCHER + setuid bwrap ARE the security boundary. The OpenCode
#     startup plugin (separate, Plan 01 Task 3) is only a liveness/mislaunch
#     detector, NOT a security boundary.
#   - FAIL CLOSED: if bwrap is missing, cannot create namespaces, the workspace
#     is a broad root, isn't a normal git checkout, or the state dir is poisoned,
#     the launcher exits nonzero and NEVER runs the child unsandboxed.
#   - bwrap itself is fail-closed: if namespace setup fails it exits nonzero
#     without exec'ing the child.
#   - Network is intentionally SHARED (--share-net) for provider API + git.
#   - V1 scope: accidental path drift (NOT malicious repo/model code — a
#     workspace-owned launcher is not a durable trust anchor against that).
#   - Linux + bubblewrap only. No fallback to raw opencode.
#
# DEFERRED to a V2 hardening pass (malicious-repo/model vectors, OUT of V1):
#   - hard links (st_nlink>1) inside the workspace to outside inodes
#   - sockets/FIFOs/devices inside the recursive workspace bind (network is
#     intentionally shared, so a socket can broker host access)
#   - descendant bind/FUSE mounts nested under the workspace (mountinfo scan)
#   - real-bwrap containment as a hard test gate (the test SKIPS when bwrap is
#     unavailable for portability; the launcher itself always fails closed)
#
# CONFIG (env, or ~/.config/opencode-sandbox/config key=value lines):
#   OPENCODE_SANDBOX_BWRAP       path to bwrap            (default: /usr/bin/bwrap)
#   OPENCODE_SANDBOX_CHILD       child to run             (default: opencode on PATH)
#   OPENCODE_SANDBOX_ENV_ALLOW   space-list of env vars   (default: PATH) forwarded via --setenv
#   OPENCODE_SANDBOX_STATE_DIR   workspace-relative state (default: .opencode/.sandbox-state)
#
# USAGE:  opencode-sandbox.sh [--workspace <dir>] [opencode-args...]
#   <dir> defaults to $PWD. Everything after a literal `--` is forwarded to the child.

set -euo pipefail

die() { echo "opencode-sandbox: $*" >&2; exit 1; }

# ---- config: env overrides, then config file key=value (parsed safely, no eval) ----
CONF="${OPENCODE_SANDBOX_CONF:-$HOME/.config/opencode-sandbox/config}"
BWRAP_BIN="${OPENCODE_SANDBOX_BWRAP:-/usr/bin/bwrap}"
CHILD="${OPENCODE_SANDBOX_CHILD:-opencode}"
ENV_ALLOW="${OPENCODE_SANDBOX_ENV_ALLOW:-PATH}"
STATE_REL="${OPENCODE_SANDBOX_STATE_DIR:-.opencode/.sandbox-state}"
# Config is a trust anchor (it selects bwrap_bin): reject symlinks and any
# group/other-writable file so another user can't swap the boundary binary.
if [ -L "$CONF" ]; then die "config is a symlink — refusing: $CONF"; fi
if [ -f "$CONF" ]; then
  CONF_MODE="$(stat -c '%a' "$CONF" 2>/dev/null || echo 0)"
  if [ -n "$CONF_MODE" ] && (( 8#$CONF_MODE & 0022 )) 2>/dev/null; then
    die "config is group/other-writable — refusing: $CONF (run: chmod go-w \"$CONF\")"
  fi
  while IFS='=' read -r k v || [ -n "$k" ]; do
    case "$k" in ''|\#*) continue;; esac
    k="${k#"${k%%[![:space:]]*}"}"; k="${k%"${k##*[![:space:]]}"}"
    v="${v%"${v##*[![:space:]]}"}"
    case "$k" in
      bwrap_bin)        BWRAP_BIN="${OPENCODE_SANDBOX_BWRAP:-$v}";;
      opencode_bin)     CHILD="${OPENCODE_SANDBOX_CHILD:-$v}";;
      env_allow)        ENV_ALLOW="${OPENCODE_SANDBOX_ENV_ALLOW:-$v}";;
      state_dir)        STATE_REL="${OPENCODE_SANDBOX_STATE_DIR:-$v}";;
    esac
  done < "$CONF"
fi

# ---- parse args: optional --workspace <dir>, then forwarded child args ----
WORKSPACE="$PWD"
FWD=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --workspace) WORKSPACE="$2"; shift 2;;
    --) shift; while [ "$#" -gt 0 ]; do FWD+=("$1"); shift; done;;
    *) FWD+=("$1"); shift;;
  esac
done

# ---- preflight ----
[ -x "$BWRAP_BIN" ] || die "bwrap not found/not executable: $BWRAP_BIN (set OPENCODE_SANDBOX_BWRAP)"

# Canonicalize the workspace (must be a real dir).
[ -d "$WORKSPACE" ] || die "workspace is not a directory: $WORKSPACE"
WORKSPACE="$(cd "$WORKSPACE" && pwd -P)" || die "cannot canonicalize workspace: $WORKSPACE"

# $HOME must be a real directory; canonicalize it so the broad-root check
# catches a symlinked home (lexical $HOME vs physical workspace would miss).
[ -n "$HOME" ] && [ -d "$HOME" ] || die "\$HOME is unset or not a directory (needed for broad-root rejection)"
HOME_CANON="$(cd "$HOME" && pwd -P)" || die "cannot canonicalize \$HOME"

# Reject broad roots: /, $HOME, or any ancestor of $HOME (would expose siblings).
[ "$WORKSPACE" = "/" ] && die "refusing to sandbox '/' (too broad)"
[ "$WORKSPACE" = "$HOME_CANON" ] && die "refusing to sandbox \$HOME ($HOME_CANON) — would expose all user data"
case "$HOME_CANON" in
  "$WORKSPACE"/*) die "refusing to sandbox an ancestor of \$HOME ($WORKSPACE) — would expose siblings";;
esac

# Must be a normal git checkout (V1): .git is a directory and git-dir == common-dir.
# Linked worktrees (.git gitfile, or git-dir != common-dir) are rejected for V1.
# Run git with location/config GIT_* env stripped so a poisoned environment can't
# redirect discovery to another repository. Reject a symlinked .git (decoy).
GIT_ENV=(env -u GIT_DIR -u GIT_WORK_TREE -u GIT_COMMON_DIR -u GIT_INDEX_FILE \
          -u GIT_OBJECT_DIRECTORY -u GIT_ALTERNATE_OBJECT_DIRECTORIES -u GIT_NAMESPACE)
GIT_DIR_OUT="$("${GIT_ENV[@]}" git -C "$WORKSPACE" rev-parse --absolute-git-dir 2>/dev/null)" \
  || die "not a git repository: $WORKSPACE (V1 requires a normal checkout)"
COMMON_OUT="$("${GIT_ENV[@]}" git -C "$WORKSPACE" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" \
  || die "cannot resolve git common-dir: $WORKSPACE"
[ "$GIT_DIR_OUT" = "$COMMON_OUT" ] \
  || die "linked worktree detected (git-dir != common-dir); V1 supports normal checkouts only"
[ -L "$WORKSPACE/.git" ] \
  && die "symlinked .git detected — refusing (V1 supports a normal .git directory only)"
[ -d "$WORKSPACE/.git" ] \
  || die "linked worktree detected (.git is not a directory); V1 supports normal checkouts only"

# State dir must be a strict workspace descendant (no absolute path, no '..'
# escape) and not a symlink (poisoned state redirect out of the workspace).
case "$STATE_REL" in
  ""|/*) die "state_dir must be a non-empty workspace-relative path: ${STATE_REL:-<empty>}";;
esac
IFS='/' read -ra _parts <<< "$STATE_REL"
for _p in "${_parts[@]}"; do
  [ "$_p" = ".." ] && die "state_dir contains '..' — refusing: $STATE_REL (would escape the workspace)"
done
STATE_DIR="$WORKSPACE/$STATE_REL"
if [ -L "$STATE_DIR" ] || [ -e "$STATE_DIR" ]; then
  [ -L "$STATE_DIR" ] && die "state dir is a symlink — refusing: $STATE_DIR"
  [ -d "$STATE_DIR" ] || die "state dir exists but is not a directory: $STATE_DIR"
fi

# bwrap-functional probe: same hardening flags + a minimal RO /usr bind + /usr/bin/true.
# Gives a clear actionable error instead of bwrap's cryptic uid-map message.
# --unshare-user drops the child to the calling (non-root) user even with setuid
# bwrap. NOTE: --disable-userns (blocks NESTED userns escape) is intentionally
# omitted — bwrap reads /proc/sys/user/max_user_namespaces to validate it, and
# AppArmor denies that read to setuid-root bwrap on this host. Nested-userns
# escape is a malicious-actor vector, OUT of V1 scope (accidental path drift only).
if "$BWRAP_BIN" --unshare-user --unshare-all --share-net --new-session --die-with-parent \
      --ro-bind /usr /usr --ro-bind-try /lib /lib --ro-bind-try /lib64 /lib64 -- /usr/bin/true >/dev/null 2>&1; then
  : # bwrap functional
else
  rc=$?
  die "bwrap cannot create namespaces (exit $rc). \
If 'setting up uid map: Permission denied', run: sudo chmod u+s $BWRAP_BIN"
fi

# ---- prepare the state dir (workspace-local, 0700) for sandbox XDG state ----
mkdir -p "$STATE_DIR/config" "$STATE_DIR/cache" "$STATE_DIR/data" "$STATE_DIR/state" 2>/dev/null || \
  die "cannot create state dir: $STATE_DIR"
chmod 700 "$STATE_DIR" "$STATE_DIR/config" "$STATE_DIR/cache" "$STATE_DIR/data" "$STATE_DIR/state" 2>/dev/null || true

# ---- build the bwrap policy ----
ARGS=(
  --unshare-user --unshare-all --share-net
  --new-session --die-with-parent
  --clearenv
  --proc /proc --dev /dev --tmpfs /tmp --tmpfs /run
  # synthetic minimal /etc (NOT the host /etc — avoids leaking /etc/opencode etc.)
  --tmpfs /etc
  --ro-bind-try /etc/resolv.conf /etc/resolv.conf
  --ro-bind-try /etc/hosts       /etc/hosts
  --ro-bind-try /etc/passwd      /etc/passwd
  --ro-bind-try /etc/group       /etc/group
  --ro-bind-try /etc/nsswitch.conf /etc/nsswitch.conf
  --ro-bind-try /etc/localtime   /etc/localtime
  --ro-bind-try /etc/ssl         /etc/ssl
  --ro-bind-try /etc/ca-certificates /etc/ca-certificates
  --ro-bind-try /etc/ld.so.cache /etc/ld.so.cache
  # RO runtime substrate
  --ro-bind /usr /usr
  --ro-bind-try /lib   /lib
  --ro-bind-try /lib64 /lib64
  --ro-bind-try /bin   /bin
  --ro-bind-try /sbin  /sbin
  # workspace RW at its canonical path (siblings stay unmounted)
  --bind "$WORKSPACE" "$WORKSPACE"
  --chdir "$WORKSPACE"
  # liveness marker for the startup plugin (NOT a security boundary)
  --setenv OPENCODE_SANDBOX_ROOT "$WORKSPACE"
)

# forward allowlisted env vars (PATH + OPENCODE_SANDBOX_ENV_ALLOW list)
for var in $ENV_ALLOW; do
  # Validate the var name before indirect expansion (reject injection via crafted names).
  case "$var" in
    [A-Za-z_]*[!A-Za-z0-9_]*|[0-9]*) die "invalid env var name in env_allow: $var";;
  esac
  val="${!var:-}"
  [ -n "$val" ] && ARGS+=(--setenv "$var" "$val")
done
# sandbox-local XDG state (auth/sessions/cache live here, not host home)
ARGS+=(
  --setenv XDG_CONFIG_HOME "$STATE_DIR/config"
  --setenv XDG_CACHE_HOME  "$STATE_DIR/cache"
  --setenv XDG_DATA_HOME   "$STATE_DIR/data"
  --setenv XDG_STATE_HOME  "$STATE_DIR/state"
  --setenv HOME            "$STATE_DIR/home"
)
mkdir -p "$STATE_DIR/home" 2>/dev/null || true

# resolve the child to an absolute, canonical path (so it survives
# --clearenv/PATH forwarding and so we can bind it into the namespace).
if ! command -v -- "$CHILD" >/dev/null 2>&1; then
  # allow an absolute/relative path child too
  [ -x "$CHILD" ] || die "child not found/executable: $CHILD (set OPENCODE_SANDBOX_CHILD)"
  CHILD_ABS="$(readlink -f -- "$CHILD" 2>/dev/null || echo "$CHILD")"
else
  CHILD_ABS="$(readlink -f -- "$(command -v -- "$CHILD")" 2>/dev/null || command -v -- "$CHILD")"
fi
[ -x "$CHILD_ABS" ] || die "child resolved but not executable: $CHILD_ABS"

# Bind the resolved child into the namespace if it lives outside the workspace
# and outside the already-mounted RO system roots (e.g. ~/.local/bin/opencode).
# bwrap creates the dest parent dirs for a file --ro-bind. A child inside the
# workspace or an RO root is already visible. (A script child that execs further
# binaries under $HOME needs a sandbox-local install — Plan 02 Task 2 activation.)
case "$CHILD_ABS" in
  "$WORKSPACE"/*) : ;;                       # already mounted RW
  /usr/*|/bin/*|/sbin/*|/lib/*|/lib64/*) : ;; # already mounted RO
  *) ARGS+=(--ro-bind "$CHILD_ABS" "$CHILD_ABS") ;;
esac

# ---- launch (fail-closed: exec replaces this process; bwrap aborts on setup failure) ----
exec "$BWRAP_BIN" "${ARGS[@]}" -- "$CHILD_ABS" "${FWD[@]}"
