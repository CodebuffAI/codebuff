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
#   ./scripts/tmux/tmux-send.sh SESSION_NAME --paste
#
# ARGUMENTS:
#   SESSION_NAME        Name of the tmux session
#   TEXT                Text to send (will be wrapped in bracketed paste)
#
# OPTIONS:
#   --key KEY           Send a special key instead of text
#                       Supported: Enter, Escape, Up, Down, Left, Right,
#                                  C-c, C-u, C-d, C-v, Tab
#   --paste             Paste current clipboard content using bracketed paste
#                       mode. This triggers the CLI's paste handler correctly,
#                       unlike --key C-v which just sends the raw keystroke.
#                       By default, Enter is pressed after pasting. Use with
#                       --no-enter to paste without submitting (useful for
#                       testing attachment UI before sending).
#   --no-enter          Don't automatically press Enter after text
#   --retry N           Retry session detection N times (default: 3)
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
#   # Paste clipboard content and submit immediately
#   ./scripts/tmux/tmux-send.sh cli-test-123 --paste
#
#   # Paste clipboard content but don't submit (view attachment card first)
#   ./scripts/tmux/tmux-send.sh cli-test-123 --paste --no-enter
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
PASTE_CLIPBOARD=false
RETRY_COUNT=3
RETRY_DELAY=0.3

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
        --paste)
            PASTE_CLIPBOARD=true
            shift
            ;;
        --no-enter)
            AUTO_ENTER=false
            shift
            ;;
        --retry)
            RETRY_COUNT="$2"
            shift 2
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

# Verify session exists with retry logic
# Sometimes sessions take a moment to be fully registered
SESSION_FOUND=false
for ((i=1; i<=RETRY_COUNT; i++)); do
    if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
        SESSION_FOUND=true
        break
    fi
    if [[ $i -lt $RETRY_COUNT ]]; then
        sleep "$RETRY_DELAY"
    fi
done

if [[ "$SESSION_FOUND" != true ]]; then
    echo "❌ Session '$SESSION_NAME' not found after $RETRY_COUNT attempts" >&2
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

# Paste clipboard content if --paste flag is set
if [[ "$PASTE_CLIPBOARD" == true ]]; then
    # Get clipboard content using pbpaste (macOS) or xclip (Linux)
    if command -v pbpaste &>/dev/null; then
        CLIPBOARD_CONTENT=$(pbpaste)
    elif command -v xclip &>/dev/null; then
        CLIPBOARD_CONTENT=$(xclip -selection clipboard -o)
    elif command -v xsel &>/dev/null; then
        CLIPBOARD_CONTENT=$(xsel --clipboard --output)
    else
        echo "❌ No clipboard utility found (pbpaste, xclip, or xsel)" >&2
        exit 1
    fi
    
    if [[ -z "$CLIPBOARD_CONTENT" ]]; then
        echo "❌ Clipboard is empty" >&2
        exit 1
    fi
    
    # Send clipboard content using bracketed paste mode
    tmux send-keys -t "$SESSION_NAME" $'\e[200~'"$CLIPBOARD_CONTENT"$'\e[201~'
    
    # Optionally press Enter
    if [[ "$AUTO_ENTER" == true ]]; then
        tmux send-keys -t "$SESSION_NAME" Enter
    fi
    
    # Log the paste as YAML
    SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"
    if [[ -d "$SESSION_DIR" ]]; then
        TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        CONTENT_LENGTH=${#CLIPBOARD_CONTENT}
        cat >> "$SESSION_DIR/commands.yaml" << EOF
- timestamp: $TIMESTAMP
  type: paste
  content_length: $CONTENT_LENGTH
  auto_enter: $AUTO_ENTER
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
