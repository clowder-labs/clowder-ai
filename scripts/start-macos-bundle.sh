#!/bin/bash

set -euo pipefail

fail() {
  printf '[macos-bundle] %s\n' "$*" >&2
  exit 64
}

require_env() {
  local name="$1"
  if [[ -z "${!name:-}" ]]; then
    fail "missing required env: $name"
  fi
}

require_env "CLOWDER_RUNTIME_ROOT"
require_env "CLOWDER_RUN_DIR"
require_env "CLOWDER_LOG_DIR"
require_env "CLOWDER_CONFIG_DIR"
require_env "CLOWDER_DATA_DIR"
require_env "CLOWDER_CACHE_DIR"

mkdir -p "$CLOWDER_RUN_DIR" "$CLOWDER_LOG_DIR" "$CLOWDER_CONFIG_DIR" "$CLOWDER_DATA_DIR" "$CLOWDER_CACHE_DIR"

printf '[macos-bundle] startup scaffold is present, but bundled service startup is not implemented yet\n' >&2
exit 64
