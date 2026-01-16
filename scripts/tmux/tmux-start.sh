#!/usr/bin/env bash

#######################################################################
# tmux-start.sh - Start a tmux session with a TUI application
#######################################################################
#
# DESCRIPTION:
#   Creates a new detached tmux session running a TUI application.
#   Returns the session name for use with other tmux helper scripts.
#   Also creates a logs directory for capturing terminal output.
#
# USAGE:
#   ./scripts/tmux/tmux-start.sh [OPTIONS]
#
# OPTIONS:
#   -c, --command CMD   Command to run in the session (required for
#                       non-Codebuff apps, or use --binary)
#   -n, --name NAME     Session name (default: tui-test-<timestamp>)
#   -w, --width WIDTH   Terminal width (default: 120)
#   -h, --height HEIGHT Terminal height (default: 30)
#   --wait SECONDS      Seconds to wait for app to initialize (default: 4)
#   -b, --binary [PATH] Use compiled binary (Codebuff-specific shortcut)
#                       If PATH omitted, uses ./cli/bin/codebuff
#                       Can also set CODEBUFF_BINARY env var
#   --help              Show this help message
#
# SESSION LOGS:
#   Session logs are automatically saved to:
#   debug/tmux-sessions/{session-name}/
#
#   Use tmux-capture.sh to save timestamped captures to this directory.
#
# EXAMPLES:
#   # Start with a custom command (any TUI app)
#   ./scripts/tmux/tmux-start.sh --command "claude"
#   ./scripts/tmux/tmux-start.sh --command "codex chat"
#   ./scripts/tmux/tmux-start.sh --command "python my_tui.py"
#
#   # Start with default Codebuff dev server (backward compatible)
#   ./scripts/tmux/tmux-start.sh
#   # Output: tui-test-1234567890
#
#   # Start with custom session name
#   ./scripts/tmux/tmux-start.sh --name my-test-session
#
#   # Start with custom dimensions
#   ./scripts/tmux/tmux-start.sh -w 160 -h 40
#
#   # Test a compiled binary (Codebuff default location)
#   ./scripts/tmux/tmux-start.sh --binary
#
#   # Test a compiled binary at custom path
#   ./scripts/tmux/tmux-start.sh --binary ./path/to/codebuff
#
# EXIT CODES:
#   0 - Success (session name printed to stdout)
#   1 - Error (tmux not found or session creation failed)
#
#######################################################################

set -e

# Get project root early (needed for defaults)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Defaults
SESSION_NAME=""
WIDTH=120
HEIGHT=30  # Reasonable default that matches typical terminal heights
WAIT_SECONDS=4
DEFAULT_BINARY="$PROJECT_ROOT/cli/bin/codebuff"
BINARY_PATH="${CODEBUFF_BINARY:-}"  # Environment variable takes precedence
CUSTOM_COMMAND=""  # Custom command to run (takes priority over binary/default)

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--command)
            CUSTOM_COMMAND="$2"
            shift 2
            ;;
        -n|--name)
            SESSION_NAME="$2"
            shift 2
            ;;
        -w|--width)
            WIDTH="$2"
            shift 2
            ;;
        -h|--height)
            HEIGHT="$2"
            shift 2
            ;;
        --wait)
            WAIT_SECONDS="$2"
            shift 2
            ;;
        -b|--binary)
            # Check if next arg is a path (not another flag or missing)
            if [[ -n "${2:-}" && "${2:-}" != -* ]]; then
                BINARY_PATH="$2"
                shift 2
            else
                # --binary alone uses default location
                BINARY_PATH="$DEFAULT_BINARY"
                shift
            fi
            ;;
        --help)
            head -n 55 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Generate session name if not provided
# Use timestamp + PID + random suffix to avoid collisions when running multiple agents in parallel
if [[ -z "$SESSION_NAME" ]]; then
    SESSION_NAME="tui-test-$(date +%s)-$$-$RANDOM"
fi

# Check if tmux is available
if ! command -v tmux &> /dev/null; then
    echo "❌ tmux not found" >&2
    echo "" >&2
    echo "📦 Installation:" >&2
    echo "  macOS:   brew install tmux" >&2
    echo "  Ubuntu:  sudo apt-get install tmux" >&2
    echo "  Arch:    sudo pacman -S tmux" >&2
    exit 1
fi

# Determine command to run (priority: custom command > binary > default)
if [[ -n "$CUSTOM_COMMAND" ]]; then
    # Custom command mode - run exactly what was specified
    CLI_CMD="cd '$PROJECT_ROOT' && $CUSTOM_COMMAND 2>&1"
    CLI_MODE="custom"
    CLI_DISPLAY="$CUSTOM_COMMAND"
elif [[ -n "$BINARY_PATH" ]]; then
    # Binary mode - validate the binary exists and is executable
    if [[ ! -f "$BINARY_PATH" ]]; then
        echo "❌ Binary not found: $BINARY_PATH" >&2
        echo "" >&2
        echo "💡 Build the binary first:" >&2
        echo "   cd cli && bun run build:binary" >&2
        exit 1
    fi
    if [[ ! -x "$BINARY_PATH" ]]; then
        echo "❌ Binary not executable: $BINARY_PATH" >&2
        echo "" >&2
        echo "💡 Fix with: chmod +x '$BINARY_PATH'" >&2
        exit 1
    fi
    CLI_CMD="cd '$PROJECT_ROOT' && '$BINARY_PATH' 2>&1"
    CLI_MODE="binary"
    CLI_DISPLAY="$BINARY_PATH"
else
    # Default mode - Codebuff dev server via bun (for backward compatibility)
    CLI_CMD="cd '$PROJECT_ROOT' && bun --cwd=cli run dev 2>&1"
    CLI_MODE="dynamic"
    CLI_DISPLAY="bun --cwd=cli run dev"
fi

# Create tmux session running app
# Note: We suppress stderr and verify session exists afterward to avoid race conditions
# where tmux returns non-zero but the session is actually created
tmux new-session -d -s "$SESSION_NAME" \
    -x "$WIDTH" -y "$HEIGHT" \
    "$CLI_CMD" 2>/dev/null || true

# Verify the session was actually created (more reliable than exit code)
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "❌ Failed to create tmux session '$SESSION_NAME'" >&2
    exit 1
fi

# Create session logs directory
SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"
mkdir -p "$SESSION_DIR"

# Clear deduplication state from any previous session with the same name
rm -f "$SESSION_DIR/.last-sent-text"

# Save session info as YAML
cat > "$SESSION_DIR/session-info.yaml" << EOF
session: $SESSION_NAME
started: $(date -u +%Y-%m-%dT%H:%M:%SZ)
started_local: $(date)
dimensions:
  width: $WIDTH
  height: $HEIGHT
cli_mode: $CLI_MODE
cli_command: $CLI_DISPLAY
status: active
EOF

# Wait for app to initialize
if [[ "$WAIT_SECONDS" -gt 0 ]]; then
    sleep "$WAIT_SECONDS"
fi

# Output session name for use by other scripts
echo "$SESSION_NAME"
