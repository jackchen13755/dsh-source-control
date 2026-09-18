#!/bin/bash
# Integration smoke test for the host half.
#
# Exercises every operation the panel can call against a throwaway repository,
# then asserts the fence refuses everything it should. Nothing outside the
# scratch directory and the managed worktree home is touched.
#
#   bash scripts/smoke-host.sh <session-id> [scratch-dir]
#
# The session id must be a live DSH session whose working directory contains the
# scratch directory (the fence resolves the workspace from it).
set -uo pipefail

BASE="${DSH_BASE:-http://127.0.0.1:3080}/dsh-source-control"
SESSION="${1:-}"
SCRATCH="${2:-}"

if [ -z "$SESSION" ]; then
  echo "usage: bash scripts/smoke-host.sh <session-id> [scratch-dir]" >&2
  exit 2
fi
if [ -z "$SCRATCH" ]; then
  SCRATCH="$(pwd)/.scm-selftest"
fi

pass=0
fail=0
check() {
  local label="$1" condition="$2" detail="${3:-}"
  if [ "$condition" = "1" ]; then
    echo "ok   $label"
    pass=$((pass + 1))
  else
    echo "FAIL $label ${detail}"
    fail=$((fail + 1))
  fi
}

call() {
  curl -sS --max-time 60 -X POST "$BASE/$1" -H 'content-type: application/json' -d "$2"
}
contains() { case "$1" in *"$2"*) echo 1 ;; *) echo 0 ;; esac; }

# --- scratch repository -----------------------------------------------------
REMOTE="${SCRATCH}-remote.git"
rm -rf "$SCRATCH" "$REMOTE"
mkdir -p "$SCRATCH"
git -C "$SCRATCH" init -q
git -C "$SCRATCH" -c user.email=smoke@test -c user.name=smoke commit -q --allow-empty -m "chore: init"
printf 'hello\n' > "$SCRATCH/a.txt"

echo "=== scratch repository: $SCRATCH"

# --- read side --------------------------------------------------------------
STATUS="$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")"
check "status reports the untracked file" "$(contains "$STATUS" '"code":"??"')"
check "status reports a branch" "$(contains "$STATUS" '"branch":"')"

DIFF="$(call diff "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"file\":\"a.txt\"}")"
check "diff of an untracked file is non-empty" "$(contains "$DIFF" 'hello')"

# --- staging, committing ----------------------------------------------------
STAGED="$(call stage "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"files\":[\"a.txt\"]}")"
check "stage accepts a relative path" "$(contains "$STAGED" '"ok":true')"
STATUS="$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")"
check "the file is staged" "$(contains "$STATUS" '"staged":[{"path":"a.txt"')"

COMMIT="$(call commit "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"message\":\"feat: smoke\"}")"
check "commit succeeds" "$(contains "$COMMIT" '"ok":true')"
UNSTAGED="$(call unstage "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"files\":[\"a.txt\"]}")"
check "unstage on a clean file succeeds" "$(contains "$UNSTAGED" '"ok":true')"

# --- branches ---------------------------------------------------------------
CREATED="$(call branch-create "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"name\":\"smoke/topic\"}")"
check "branch-create switches to the new branch" "$(contains "$CREATED" '"branch":"smoke/topic"')"
STATUS="$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")"
check "HEAD moved to the new branch" "$(contains "$STATUS" '"branch":"smoke/topic"')"

printf 'more\n' >> "$SCRATCH/a.txt"
call stage "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"files\":[\"a.txt\"]}" >/dev/null
call commit "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"message\":\"feat: topic\"}" >/dev/null
SWITCHED="$(call switch "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"branch\":\"master\"}")"
if [ "$(contains "$SWITCHED" '"ok":true')" = "0" ]; then
  SWITCHED="$(call switch "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"branch\":\"main\"}")"
fi
check "switch returns to the initial branch" "$(contains "$SWITCHED" '"ok":true')"
MERGED="$(call merge "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"branch\":\"smoke/topic\"}")"
check "merge brings the topic branch in" "$(contains "$MERGED" '"ok":true')"
DELETED="$(call branch-delete "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"name\":\"smoke/topic\",\"confirm\":true}")"
check "branch-delete removes a merged branch" "$(contains "$DELETED" '"ok":true')"

# --- worktrees --------------------------------------------------------------
ADDED="$(call worktree-add "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"name\":\"smoke-wt\",\"base\":\"HEAD\"}")"
check "worktree-add creates a linked worktree" "$(contains "$ADDED" '"ok":true')"
WT_PATH="$(printf '%s' "$ADDED" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).value.path)}catch{console.log("")}})')"
check "the worktree landed in the managed home" "$(contains "$WT_PATH" 'source-control/worktrees')" "$WT_PATH"
check "the worktree was registered as a workspace" "$(contains "$ADDED" '"registered":true')"

LIST="$(call worktree-list "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")"
check "worktree-list shows the new worktree" "$(contains "$LIST" 'smoke-wt')"
check "worktree-list marks the main worktree" "$(contains "$LIST" '"main":true')"
check "the worktree is usable as a repository" "$(contains "$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$WT_PATH\"}")" '"ok":true')"

REMOVED="$(call worktree-remove "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"worktree\":\"$WT_PATH\",\"confirm\":true}")"
check "worktree-remove deletes it" "$(contains "$REMOVED" '"ok":true')"
check "the directory is gone" "$([ ! -d "$WT_PATH" ] && echo 1 || echo 0)"
PRUNED="$(call worktree-prune "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")"
check "worktree-prune succeeds" "$(contains "$PRUNED" '"ok":true')"

# --- publishing a branch to a remote ---------------------------------------
# A branch that exists only locally is the case the panel's 推送 used to fail
# on: git refuses to push it without an upstream. A bare repository inside the
# scratch directory stands in for the real remote.
git init --bare -q "$REMOTE"
git -C "$SCRATCH" remote add origin "$REMOTE"
BRANCH="$(git -C "$SCRATCH" rev-parse --abbrev-ref HEAD)"

NOPUB="$(call push "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"confirm\":true}")"
check "pushing a branch with no upstream reports no-upstream" "$(contains "$NOPUB" 'no-upstream')"
check "the refusal explains how to fix it" "$(contains "$NOPUB" '发布分支')"

PUBLISHED="$(call push "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"confirm\":true,\"setUpstream\":true,\"branch\":\"$BRANCH\"}")"
check "publish pushes with --set-upstream" "$(contains "$PUBLISHED" '"published":true')"
check "the remote now has the branch" "$(git -C "$REMOTE" show-ref --verify --quiet "refs/heads/$BRANCH" && echo 1 || echo 0)"
check "the branch now has an upstream" "$(contains "$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")" '"upstream":"origin/')"

# --- checking out a branch that only exists on the remote --------------------
# The panel offers this for remote rows; git's DWIM is spelled out as -c/--track.
git -C "$SCRATCH" switch -q -c remote-only
printf 'remote only\n' > "$SCRATCH/r.txt"
git -C "$SCRATCH" add r.txt
git -C "$SCRATCH" -c user.email=smoke@test -c user.name=smoke commit -q -m "test: remote only"
git -C "$SCRATCH" push -q origin remote-only
git -C "$SCRATCH" switch -q "$BRANCH"
git -C "$SCRATCH" branch -q -D remote-only
git -C "$SCRATCH" fetch -q origin

TRACKED="$(call switch "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"branch\":\"origin/remote-only\",\"track\":true}")"
check "checkout of a remote-only branch succeeds" "$(contains "$TRACKED" '"ok":true')"
check "it creates the local branch" "$(git -C "$SCRATCH" show-ref --verify --quiet refs/heads/remote-only && echo 1 || echo 0)"
check "the new branch tracks the remote" "$(contains "$(git -C "$SCRATCH" rev-parse --abbrev-ref 'remote-only@{u}' 2>/dev/null)" 'origin/remote-only')"
check "the working tree switched to it" "$(contains "$(git -C "$SCRATCH" rev-parse --abbrev-ref HEAD)" 'remote-only')"
SWITCHED_BACK="$(call switch "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"branch\":\"$BRANCH\"}")"
check "switching back to a local branch works" "$(contains "$SWITCHED_BACK" '"ok":true')"

# --- refusals ---------------------------------------------------------------
check "an unknown session is refused" "$(contains "$(call status '{"sessionId":"session-nope"}')" 'unknown-session')"
check "a path outside the workspace is refused" "$(contains "$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"/etc\"}")" 'outside-workspace')"
check "a path-traversal repo is refused" "$(contains "$(call status "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH/../../..\"}")" 'outside-workspace')"
check "push without confirm is refused" "$(contains "$(call push "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\"}")" 'needs-confirm')"
check "discard without confirm is refused" "$(contains "$(call discard "{\"sessionId\":\"$SESSION\",\"repo\":\"$SCRATCH\",\"files\":[\"a.txt\"]}")" 'needs-confirm')"
check "a GET is refused" "$([ "$(curl -sS -o /dev/null -w '%{http_code}' "$BASE/status")" = "405" ] && echo 1 || echo 0)"

# --- cleanup ----------------------------------------------------------------
rm -rf "$SCRATCH" "$REMOTE"
echo
echo "smoke-host: $pass passed, $fail failed"
[ "$fail" -eq 0 ]
