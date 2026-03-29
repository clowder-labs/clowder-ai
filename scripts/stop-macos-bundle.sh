#!/bin/bash

set -euo pipefail

RUN_DIR="${CLOWDER_RUN_DIR:-}"
if [[ -z "$RUN_DIR" ]]; then
  exit 0
fi

rm -f "$RUN_DIR/api.pid" "$RUN_DIR/web.pid" "$RUN_DIR/mcp-server.pid" "$RUN_DIR/runtime-state.json"
