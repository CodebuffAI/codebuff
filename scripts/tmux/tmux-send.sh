#!/usr/bin/env bash

#######################################################################
# tmux-send.sh - Send input to the Codebuff CLI in a tmux session
#######################################################################
#
# DESCRIPTION:
#   Sends text input to a tmux session running the Codebuff CLI.
#   Uses BRACKETED PASTE MODE which is REQUIRED for the CLI to receive
#   input correctly. Standard tmux send-keys drops characters!
#
# IMPORTANT:
#   This script handles the bracketed paste escape sequences automatically.
#   You do NOT need to add escape sequences to your input.
#
# USAGE:
#   ./scripts/tmux/tmux-send.sh SESSION_NAME "your text here"
#   ./scripts/tmux/tmux-send.sh SESSION_NAME --key KEY
#
# ARGUMENTS:
#   SESSION_NAME        Name of the tmux session
#   TEXT                Text to send (will be wrapped in bracketed paste)
#
# OPTIONS:
#   --key KEY           Send a special key instead of text
#                       Supported: Enter, Escape, Up, Down, Left, Right,
#                                  C-c, C-u, C-d, Tab
#   --no-enter          Don't automatically press Enter after text
#   --help              Show this help message
#
# EXAMPLES:
#   # Send a command to the CLI
#   ./scripts/tmux/tmux-send.sh cli-test-123 "/help"
#
#   # Send text without pressing Enter
#   ./scripts/tmux/tmux-send.sh cli-test-123 "partial text" --no-enter
#
#   # Send a special key
#   ./scripts/tmux/tmux-send.sh cli-test-123 --key Escape
#
#   # Send Ctrl+C to interrupt
#   ./scripts/tmux/tmux-send.sh cli-test-123 --key C-c
#
# WHY BRACKETED PASTE?
#   The Codebuff CLI uses OpenTUI for rendering, which processes keyboard
#   input character-by-character. When tmux sends characters rapidly,
#   they get dropped or garbled. Bracketed paste mode (\e[200~...\e[201~)
#   tells the terminal to treat the input as a paste operation, which is
#   processed atomically.
#
# EXIT CODES:
#   0 - Success
#   1 - Error (missing arguments, session not found)
#
#######################################################################

set -e

# Get project root for logging
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Defaults
AUTO_ENTER=true
SPECIAL_KEY=""

# Check minimum arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 SESSION_NAME \"text\" [OPTIONS]" >&2
    echo "       $0 SESSION_NAME --key KEY" >&2
    echo "Run with --help for more information" >&2
    exit 1
fi

# First argument is always session name
SESSION_NAME="$1"
shift

# Handle --help first
if [[ "$SESSION_NAME" == "--help" ]]; then
    head -n 55 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
    exit 0
fi

# Parse remaining arguments
TEXT=""
while [[ $# -gt 0 ]]; do
    case $1 in
        --key)
            SPECIAL_KEY="$2"
            shift 2
            ;;
        --no-enter)
            AUTO_ENTER=false
            shift
            ;;
        --help)
            head -n 55 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            TEXT="$1"
            shift
            ;;
    esac
done

# Verify session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "❌ Session '$SESSION_NAME' not found" >&2
    echo "   Run: tmux list-sessions" >&2
    exit 1
fi

# Send special key if specified
if [[ -n "$SPECIAL_KEY" ]]; then
    tmux send-keys -t "$SESSION_NAME" "$SPECIAL_KEY"
    
    # Log the special key send as YAML
    SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"
    if [[ -d "$SESSION_DIR" ]]; then
        TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        # Append YAML entry to commands.yaml
        cat >> "$SESSION_DIR/commands.yaml" << EOF
- timestamp: $TIMESTAMP
  type: key
  input: "$SPECIAL_KEY"
EOF
    fi
    
    exit 0
fi

# Check if text was provided
if [[ -z "$TEXT" ]]; then
    echo "❌ No text or --key specified" >&2
    exit 1
fi

# Send text using bracketed paste mode
# \e[200~ = start bracketed paste
# \e[201~ = end bracketed paste
tmux send-keys -t "$SESSION_NAME" $'\e[200~'"$TEXT"$'\e[201~'

# Optionally press Enter
if [[ "$AUTO_ENTER" == true ]]; then
    tmux send-keys -t "$SESSION_NAME" Enter
fi

# Log the text send as YAML
SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"
if [[ -d "$SESSION_DIR" ]]; then
    TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    # Escape special characters in text for YAML (double quotes, backslashes)
    ESCAPED_TEXT=$(echo "$TEXT" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g')
    # Append YAML entry to commands.yaml
    cat >> "$SESSION_DIR/commands.yaml" << EOF
- timestamp: $TIMESTAMP
  type: text
  input: "$ESCAPED_TEXT"
  auto_enter: $AUTO_ENTER
EOF
fi
