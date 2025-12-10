#!/bin/bash
# Development Environment Startup Script

set -e

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
LOG_DIR="$PROJECT_ROOT/debug/console"
BUN="$PROJECT_ROOT/.bin/bun"

export PATH="$PROJECT_ROOT/.bin:$PATH"
mkdir -p "$LOG_DIR"

# =============================================================================
# UI Helpers
# =============================================================================

SPINNER=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

ok()   { printf "  \033[32m✓\033[0m %-10s %s\033[K\n" "$1" "$2"; }
fail() { printf "  \033[31m✗\033[0m %-10s %s\033[K\n" "$1" "$2"; }

# Wait for a condition with spinner animation
# Usage: wait_for <name> <check_command> [timeout_seconds]
wait_for() {
    local name="$1" check="$2" timeout="${3:-60}"
    local frame=0 elapsed=0

    printf "\033[?25l"  # hide cursor
    while ! eval "$check" >/dev/null 2>&1; do
        printf "\r  %s %-10s starting..." "${SPINNER[$frame]}" "$name"
        frame=$(( (frame + 1) % ${#SPINNER[@]} ))
        sleep 0.5
        elapsed=$((elapsed + 1))
        if ((elapsed > timeout * 2)); then
            printf "\033[?25h\n"
            fail "$name" "timeout"
            return 1
        fi
    done
    printf "\r"
    ok "$name" "ready!"
    printf "\033[?25h"  # show cursor
}

# =============================================================================
# Cleanup
# =============================================================================

cleanup() {
    printf "\033[?25h"  # restore cursor
    echo ""
    echo "Shutting down..."
    echo ""
    tmux kill-session -t codebuff-web 2>/dev/null && ok "web" "stopped"
    pkill -f 'drizzle-kit studio' 2>/dev/null && ok "studio" "stopped"
    pkill -f 'bun.*--cwd sdk' 2>/dev/null && ok "sdk" "stopped"
    echo ""
}
trap cleanup EXIT INT TERM

# =============================================================================
# Start Services
# =============================================================================

echo "Starting development environment..."
echo ""

# 1. Database (blocking - must complete before other services)
printf "  %s %-10s starting...\r" "${SPINNER[0]}" "db"
bun --cwd packages/internal db:start > "$LOG_DIR/db.log" 2>&1
ok "db" "ready!"

# 2. Background services (non-blocking)
bun run --cwd sdk build > "$LOG_DIR/sdk.log" 2>&1 &
bun --cwd packages/internal db:studio > "$LOG_DIR/studio.log" 2>&1 &
ok "studio" "(background)"

# 3. Web server (wait for health check)
tmux kill-session -t codebuff-web 2>/dev/null || true
pkill -f 'next-server' 2>/dev/null || true

# Use unbuffer for real-time log output (creates pseudo-TTY to prevent buffering)
# Strip ANSI escape codes with sed -l for line-buffered output
if command -v unbuffer &>/dev/null; then
    tmux new-session -d -s codebuff-web "cd $PROJECT_ROOT && unbuffer $BUN --cwd web dev 2>&1 | sed -l 's/\x1b\[[0-9;]*m//g' | tee $LOG_DIR/web.log"
else
    tmux new-session -d -s codebuff-web "cd $PROJECT_ROOT && $BUN --cwd web dev 2>&1 | sed -l 's/\x1b\[[0-9;]*m//g' | tee $LOG_DIR/web.log"
fi

wait_for "web" "curl -sf ${NEXT_PUBLIC_CODEBUFF_APP_URL}/api/healthz"

# 4. CLI (foreground - user interaction)
echo ""
echo "Starting CLI..."
bun --cwd cli dev "$@"
