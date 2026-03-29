#!/usr/bin/env bash
# macOS bundled-release startup script.
#
# Launches Redis + API + Web from the .app bundle's embedded runtimes.
# Equivalent of start-windows.ps1 for macOS.
#
# Environment:
#   CAT_CAFE_MACOS_BUNDLED=1  — set by Swift launcher
#   PATH includes tools/node/bin and tools/redis/bin

set -euo pipefail

# ─── Resolve paths ───────────────────────────────────────────────────

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ─── Configuration ───────────────────────────────────────────────────

# Load .env if present (respect explicit overrides)
if [ -f "$PROJECT_ROOT/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env"
    set +a
fi

API_PORT="${API_SERVER_PORT:-3004}"
WEB_PORT="${FRONTEND_PORT:-3003}"
REDIS_PORT="${REDIS_PORT:-6399}"

BUNDLED_NODE="$PROJECT_ROOT/tools/node/bin/node"
BUNDLED_REDIS="$PROJECT_ROOT/tools/redis/bin/redis-server"
BUNDLED_REDIS_CLI="$PROJECT_ROOT/tools/redis/bin/redis-cli"

# Data directories (use ~/.cat-cafe for v1 compatibility)
CAT_CAFE_HOME="${CAT_CAFE_GLOBAL_CONFIG_ROOT:-$HOME/.cat-cafe}"
REDIS_DATA_DIR="${REDIS_DATA_DIR:-$CAT_CAFE_HOME/redis-prod}"
RUNTIME_STATE_DIR="$CAT_CAFE_HOME/run/macos"
RUNTIME_STATE_FILE="$RUNTIME_STATE_DIR/runtime-state.json"
LOG_DIR="$CAT_CAFE_HOME/logs"

mkdir -p "$REDIS_DATA_DIR" "$RUNTIME_STATE_DIR" "$LOG_DIR"

# PID tracking
MANAGED_PIDS=()
STARTED_REDIS=false
CLEANUP_RUNNING=false

# ─── Helpers ─────────────────────────────────────────────────────────

log() { echo -e "$(date '+%H:%M:%S') $*"; }

write_runtime_state() {
    cat > "$RUNTIME_STATE_FILE" <<JSONEOF
{
  "FRONTEND_PORT": $WEB_PORT,
  "API_SERVER_PORT": $API_PORT,
  "REDIS_PORT": $REDIS_PORT,
  "REDIS_URL": "redis://localhost:$REDIS_PORT",
  "pid": $$,
  "startedAt": "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
}
JSONEOF
}

wait_for_port() {
    local port="$1" label="$2" timeout="${3:-30}"
    local elapsed=0
    while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
        sleep 1
        elapsed=$((elapsed + 1))
        if [ "$elapsed" -ge "$timeout" ]; then
            log "${RED}  ✗ $label failed to start on port $port (timeout ${timeout}s)${NC}"
            return 1
        fi
    done
    log "${GREEN}  ✓ $label ready (port $port)${NC}"
}

# ─── Cleanup ─────────────────────────────────────────────────────────

cleanup() {
    [ "$CLEANUP_RUNNING" = true ] && return 0
    CLEANUP_RUNNING=true

    log "Shutting down services..."

    # Kill managed child processes
    for pid in "${MANAGED_PIDS[@]}"; do
        if kill -0 "$pid" 2>/dev/null; then
            kill "$pid" 2>/dev/null || true
        fi
    done

    # Stop Redis if we started it
    if [ "$STARTED_REDIS" = true ] && "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
        "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" shutdown save &>/dev/null || true
        log "  Redis (port $REDIS_PORT) stopped."
    fi

    rm -f "$RUNTIME_STATE_FILE"

    wait 2>/dev/null || true
    log "Goodbye!"
}

trap cleanup EXIT INT TERM

# ─── Preflight checks ───────────────────────────────────────────────

log "${GREEN}=== Clowder AI macOS Bundled Startup ===${NC}"

if [ ! -x "$BUNDLED_NODE" ]; then
    log "${RED}  ✗ Bundled Node.js not found at $BUNDLED_NODE${NC}"
    exit 1
fi

NODE_VERSION=$("$BUNDLED_NODE" --version)
log "  Node.js: $NODE_VERSION"

if [ ! -x "$BUNDLED_REDIS" ]; then
    log "${RED}  ✗ Bundled Redis not found at $BUNDLED_REDIS${NC}"
    exit 1
fi

REDIS_VERSION=$("$BUNDLED_REDIS" --version | head -1)
log "  Redis: $REDIS_VERSION"

# ─── Start Redis ─────────────────────────────────────────────────────

log "Starting Redis (port $REDIS_PORT)..."

if "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
    log "${GREEN}  ✓ Redis already running (port $REDIS_PORT)${NC}"
else
    "$BUNDLED_REDIS" \
        --port "$REDIS_PORT" \
        --bind 127.0.0.1 \
        --dir "$REDIS_DATA_DIR" \
        --dbfilename "dump.rdb" \
        --save "3600 1 300 100 60 10000" \
        --appendonly yes \
        --appendfilename "appendonly.aof" \
        --appendfsync everysec \
        --daemonize yes \
        --pidfile "$REDIS_DATA_DIR/redis-$REDIS_PORT.pid" \
        --logfile "$LOG_DIR/redis-$REDIS_PORT.log" \
        >/dev/null 2>&1

    sleep 1
    if "$BUNDLED_REDIS_CLI" -p "$REDIS_PORT" ping &>/dev/null 2>&1; then
        log "${GREEN}  ✓ Redis started (port $REDIS_PORT)${NC}"
        STARTED_REDIS=true
    else
        log "${RED}  ✗ Redis failed to start${NC}"
        exit 1
    fi
fi

export REDIS_URL="redis://localhost:$REDIS_PORT"
export REDIS_PORT

# ─── Start API Server ───────────────────────────────────────────────

log "Starting API Server (port $API_PORT)..."

export API_SERVER_PORT="$API_PORT"
export FRONTEND_PORT="$WEB_PORT"
export NODE_ENV=production

API_DIST="$PROJECT_ROOT/packages/api/dist/index.js"
if [ ! -f "$API_DIST" ]; then
    log "${RED}  ✗ API dist not found: $API_DIST${NC}"
    exit 1
fi

"$BUNDLED_NODE" "$API_DIST" \
    >> "$LOG_DIR/api-server.log" 2>&1 &
MANAGED_PIDS+=($!)

wait_for_port "$API_PORT" "API Server" 20 || exit 1

# ─── Start Web Frontend ─────────────────────────────────────────────

log "Starting Frontend (port $WEB_PORT)..."

WEB_SERVER="$PROJECT_ROOT/packages/web/server.js"
if [ ! -f "$WEB_SERVER" ]; then
    log "${RED}  ✗ Web server.js not found: $WEB_SERVER${NC}"
    exit 1
fi

PORT="$WEB_PORT" "$BUNDLED_NODE" "$WEB_SERVER" \
    >> "$LOG_DIR/web-frontend.log" 2>&1 &
MANAGED_PIDS+=($!)

wait_for_port "$WEB_PORT" "Frontend" 30 || exit 1

# ─── Write runtime state ────────────────────────────────────────────

write_runtime_state

log ""
log "${GREEN}=== Clowder AI is running ===${NC}"
log "  Frontend: http://localhost:$WEB_PORT"
log "  API:      http://localhost:$API_PORT"
log "  Redis:    redis://localhost:$REDIS_PORT"
log "  Data:     $REDIS_DATA_DIR"
log ""

# Keep script alive — wait for child processes
wait
