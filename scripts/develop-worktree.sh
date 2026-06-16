#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

DEFAULT_DEVELOP_DIR="$(cd "$PROJECT_DIR/.." && pwd)/cat-cafe-develop"

export CAT_CAFE_RUNTIME_DIR="${CAT_CAFE_DEVELOP_DIR:-$DEFAULT_DEVELOP_DIR}"
export CAT_CAFE_RUNTIME_BRANCH="${CAT_CAFE_DEVELOP_BRANCH:-develop-runtime-sync}"
export CAT_CAFE_RUNTIME_REMOTE="${CAT_CAFE_DEVELOP_REMOTE:-origin}"
export CAT_CAFE_RUNTIME_SOURCE_BRANCH="${CAT_CAFE_DEVELOP_SOURCE_BRANCH:-develop}"

# Keep develop dogfood away from runtime (3003/3004/6399) and alpha
# (3011/3012/6398). Offset -20 derives Redis 6378, API 3122, Web 5122.
export WORKTREE_PORT_OFFSET="${CAT_CAFE_DEVELOP_WORKTREE_PORT_OFFSET:--20}"

exec "$SCRIPT_DIR/runtime-worktree.sh" "$@"
