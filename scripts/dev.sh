#!/bin/bash

# =============================================================================
# Development Environment Startup Script
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
export PATH="$PROJECT_ROOT/.bin:$PATH"

LOG_DIR="$PROJECT_ROOT/debug/proc"
mkdir -p "$LOG_DIR"

# =============================================================================
# UI Helpers
# =============================================================================

SPINNER_FRAMES=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')

# Print a success line
ok() {
    printf "  \033[32m✓\033[0m %-10s %s\033[K\n" "$1" "$2"
}

# Wait for a pattern in a log file, with spinner animation
wait_for_log() {
    local name="$1"
    local pattern="$2"
    local timeout="${3:-60}"
    local frame=0
    local elapsed=0
    
    printf "\033[?25l"  # Hide cursor
    printf "  %s %-10s starting...\n" "${SPINNER_FRAMES[0]}" "$name"
    
    while ! grep -q "$pattern" "$LOG_DIR/$name.log" 2>/dev/null; do
        printf "\033[1A"  # Move up one line
        printf "  %s %-10s starting...\033[K\n" "${SPINNER_FRAMES[$frame]}" "$name"
        
        frame=$(( (frame + 1) % ${#SPINNER_FRAMES[@]} ))
        sleep 0.1
        elapsed=$(( elapsed + 1 ))
        
        if (( elapsed > timeout * 10 )); then
            printf "\033[?25h"  # Show cursor
            echo "Timeout waiting for $name" >&2
            return 1
        fi
    done
    
    printf "\033[1A"  # Move up one line
    ok "$name" "ready!"
    printf "\033[?25h"  # Show cursor
}

# =============================================================================
# Cleanup
# =============================================================================

kill_proc() {
    local name="$1"
    local pattern="$2"
    if pkill -f "$pattern" 2>/dev/null; then
        echo "[$(date '+%H:%M:%S')] Killed $name" >> "$LOG_DIR/$name.log"
        return 0
    fi
    return 1
}

cleanup() {
    printf "\033[?25h"  # Restore cursor
    echo ""
    echo "Shutting down..."
    echo ""
    
    kill_proc "web" 'bun.*--cwd web dev' || kill_proc "web" 'next-server'
    ok "web" "stopped"
    
    kill_proc "studio" 'drizzle-kit studio' && ok "studio" "stopped"
    kill_proc "sdk" 'bun.*--cwd sdk' && ok "sdk" "stopped"
    
    echo ""
}
trap cleanup EXIT INT TERM

# =============================================================================
# Start Processes
# =============================================================================

echo "Starting development environment..."
echo ""

# 1. Database (blocking)
printf "  %s %-10s starting...\r" "${SPINNER_FRAMES[0]}" "db"
bun --cwd packages/internal db:start > "$LOG_DIR/db.log" 2>&1
ok "db" "ready!"

# 2. Background processes (fire and forget)
bun --cwd sdk run build > "$LOG_DIR/sdk.log" 2>&1 &
ok "sdk" "(background)"

bun --cwd packages/internal db:studio > "$LOG_DIR/studio.log" 2>&1 &
ok "studio" "(background)"

# 3. Web server (wait for ready)
bun --cwd web dev > "$LOG_DIR/web.log" 2>&1 &
wait_for_log "web" "Ready in" 60

# 4. CLI
echo ""
echo "Starting CLI..."
bun --cwd cli dev "$@"
