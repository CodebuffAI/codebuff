#!/usr/bin/env bash

#######################################################################
# tmux-start.sh - Start a tmux session with the Codebuff CLI
#######################################################################
#
# DESCRIPTION:
#   Creates a new detached tmux session running the Codebuff CLI.
#   Returns the session name for use with other tmux helper scripts.
#   Also creates a screenshots directory for capturing terminal output.
#
# USAGE:
#   ./scripts/tmux/tmux-start.sh [OPTIONS]
#
# OPTIONS:
#   -n, --name NAME     Session name (default: cli-test-<timestamp>)
#   -w, --width WIDTH   Terminal width (default: 120)
#   -h, --height HEIGHT Terminal height (default: 80)
#   --wait SECONDS      Seconds to wait for CLI to initialize (default: 4)
#   -b, --binary [PATH] Use compiled binary instead of dynamic CLI
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
#   # Start with default settings
#   ./scripts/tmux/tmux-start.sh
#   # Output: cli-test-1234567890
#
#   # Start with custom session name
#   ./scripts/tmux/tmux-start.sh --name my-test-session
#
#   # Start with custom dimensions
#   ./scripts/tmux/tmux-start.sh -w 160 -h 40
#
#   # Test a compiled binary (default location)
#   ./scripts/tmux/tmux-start.sh --binary
#
#   # Test a compiled binary at custom path
#   ./scripts/tmux/tmux-start.sh --binary ./path/to/codebuff
#
#   # Via environment variable
#   CODEBUFF_BINARY=./cli/bin/codebuff ./scripts/tmux/tmux-start.sh
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

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
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
            head -n 50 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Generate session name if not provided
if [[ -z "$SESSION_NAME" ]]; then
    SESSION_NAME="cli-test-$(date +%s)"
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

# Determine CLI command (binary vs dynamic)
if [[ -n "$BINARY_PATH" ]]; then
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
    # Dynamic mode (default) - run via bun
    CLI_CMD="cd '$PROJECT_ROOT' && bun --cwd=cli run dev 2>&1"
    CLI_MODE="dynamic"
    CLI_DISPLAY="bun --cwd=cli run dev"
fi

# Create tmux session running CLI
if ! tmux new-session -d -s "$SESSION_NAME" \
    -x "$WIDTH" -y "$HEIGHT" \
    "$CLI_CMD" 2>/dev/null; then
    echo "❌ Failed to create tmux session" >&2
    exit 1
fi

# Create session logs directory
SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"
mkdir -p "$SESSION_DIR"

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

# Wait for CLI to initialize
if [[ "$WAIT_SECONDS" -gt 0 ]]; then
    sleep "$WAIT_SECONDS"
fi

# Output session name for use by other scripts
echo "$SESSION_NAME"
