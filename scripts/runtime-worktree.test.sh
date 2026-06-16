#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# shellcheck source=./runtime-worktree.sh
source "$SCRIPT_DIR/runtime-worktree.sh" --source-only

assert_contains() {
  local haystack="$1"
  local needle="$2"
  local message="$3"

  if [[ "$haystack" != *"$needle"* ]]; then
    echo "FAIL: $message"
    echo "  missing: $needle"
    exit 1
  fi
}

test_usage_includes_source_branch() {
  local output
  output="$(usage)"
  assert_contains "$output" "--source-branch NAME" "usage should document source branch"
  assert_contains "$output" "--source-branch main" "usage should show default source branch"
  echo "PASS: usage documents runtime source branch"
}

test_init_and_sync_runtime_worktree_from_develop() {
  local tmp_root origin_dir src_dir runtime_dir initial_head expected_head synced_head status_output
  tmp_root="$(mktemp -d)"
  trap 'rm -rf "$tmp_root"' RETURN

  origin_dir="$tmp_root/origin.git"
  src_dir="$tmp_root/src"
  runtime_dir="$tmp_root/cat-cafe-develop"

  git init --bare "$origin_dir" >/dev/null
  git clone "$origin_dir" "$src_dir" >/dev/null 2>&1
  git -C "$src_dir" config user.name "Runtime Test"
  git -C "$src_dir" config user.email "runtime-test@example.com"

  echo "main" > "$src_dir/README.md"
  git -C "$src_dir" add README.md
  git -C "$src_dir" commit -m "main init" >/dev/null
  git -C "$src_dir" branch -M main
  git -C "$src_dir" push -u origin main >/dev/null 2>&1

  git -C "$src_dir" switch -c develop >/dev/null
  echo "develop" > "$src_dir/README.md"
  git -C "$src_dir" add README.md
  git -C "$src_dir" commit -m "develop init" >/dev/null
  git -C "$src_dir" push -u origin develop >/dev/null 2>&1

  PROJECT_DIR="$src_dir"
  RUNTIME_DIR="$(abs_path "$runtime_dir")"
  RUNTIME_BRANCH="develop-runtime-sync"
  REMOTE_NAME="origin"
  SOURCE_BRANCH="develop"
  RUN_INSTALL=false
  FORCE=true

  init_runtime_worktree

  initial_head="$(git -C "$RUNTIME_DIR" rev-parse HEAD)"
  expected_head="$(git -C "$PROJECT_DIR" rev-parse origin/develop)"
  [ "$initial_head" = "$expected_head" ] || {
    echo "FAIL: init should create runtime worktree from origin/develop"
    exit 1
  }

  echo "develop two" >> "$src_dir/README.md"
  git -C "$src_dir" add README.md
  git -C "$src_dir" commit -m "develop update" >/dev/null
  git -C "$src_dir" push >/dev/null 2>&1

  sync_runtime_worktree

  synced_head="$(git -C "$RUNTIME_DIR" rev-parse HEAD)"
  expected_head="$(git -C "$PROJECT_DIR" rev-parse origin/develop)"
  [ "$synced_head" = "$expected_head" ] || {
    echo "FAIL: sync should fast-forward runtime worktree to origin/develop"
    exit 1
  }

  status_output="$(status_runtime_worktree)"
  assert_contains "$status_output" "source: origin/develop" "status should report source branch"

  echo "PASS: init + sync runtime worktree from develop"
}

test_usage_includes_source_branch
test_init_and_sync_runtime_worktree_from_develop
