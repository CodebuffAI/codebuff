#!/usr/bin/env bash

#######################################################################
# tmux-capture.sh - Capture output from a tmux session
#######################################################################
#
# DESCRIPTION:
#   Captures the current terminal output from a tmux session.
#   Automatically saves captures to debug/tmux-sessions/{session}/
#   Useful for verifying CLI behavior and debugging.
#
# USAGE:
#   ./scripts/tmux/tmux-capture.sh SESSION_NAME [OPTIONS]
#
# ARGUMENTS:
#   SESSION_NAME        Name of the tmux session
#
# OPTIONS:
#   -c, --colors        Preserve ANSI color codes in output
#   -s, --start LINE    Start capture from this line (default: -)
#   -e, --end LINE      End capture at this line (default: -)
#   -o, --output FILE   Write output to file instead of stdout
#   --wait SECONDS      Wait this many seconds before capturing (default: 0)
#   --no-save           Don't auto-save to session logs directory
#   -l, --label LABEL   Add a label to the capture filename
#   --help              Show this help message
#
# SESSION LOGS:
#   By default, captures are automatically saved to:
#   debug/tmux-sessions/{session-name}/capture-{timestamp}.txt
#
#   The capture path is printed to stderr so you can capture it:
#   CAPTURE_PATH=$(./scripts/tmux/tmux-capture.sh session 2>&1 >/dev/null)
#
# EXAMPLES:
#   # Capture current output (auto-saves to session logs)
#   ./scripts/tmux/tmux-capture.sh cli-test-123
#
#   # Capture with a label for the log file
#   ./scripts/tmux/tmux-capture.sh cli-test-123 --label "after-help-command"
#
#   # Capture with colors preserved
#   ./scripts/tmux/tmux-capture.sh cli-test-123 --colors
#
#   # Wait 2 seconds then capture (for async responses)
#   ./scripts/tmux/tmux-capture.sh cli-test-123 --wait 2
#
#   # Save to specific file (disables auto-save to session logs)
#   ./scripts/tmux/tmux-capture.sh cli-test-123 -o output.txt
#
#   # Capture without auto-saving to session logs
#   ./scripts/tmux/tmux-capture.sh cli-test-123 --no-save
#
# EXIT CODES:
#   0 - Success (output printed to stdout or file)
#   1 - Error (session not found)
#
#######################################################################

set -e

# Defaults
COLORS=false
START_LINE="-"
END_LINE="-"
OUTPUT_FILE=""
WAIT_SECONDS=0
AUTO_SAVE=true
LABEL=""
SEQUENCE_FILE=""

# Check minimum arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 SESSION_NAME [OPTIONS]" >&2
    echo "Run with --help for more information" >&2
    exit 1
fi

# First argument is session name
SESSION_NAME="$1"
shift

# Handle --help first
if [[ "$SESSION_NAME" == "--help" ]]; then
    head -n 60 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
    exit 0
fi

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--colors)
            COLORS=true
            shift
            ;;
        -s|--start)
            START_LINE="$2"
            shift 2
            ;;
        -e|--end)
            END_LINE="$2"
            shift 2
            ;;
        -o|--output)
            OUTPUT_FILE="$2"
            AUTO_SAVE=false  # Manual output disables auto-save
            shift 2
            ;;
        --wait)
            WAIT_SECONDS="$2"
            shift 2
            ;;
        --no-save)
            AUTO_SAVE=false
            shift
            ;;
        -l|--label)
            LABEL="$2"
            shift 2
            ;;
        --help)
            head -n 60 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            echo "Unknown option: $1" >&2
            exit 1
            ;;
    esac
done

# Verify session exists
if ! tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "❌ Session '$SESSION_NAME' not found" >&2
    echo "   Run: tmux list-sessions" >&2
    exit 1
fi

# Wait if requested
if [[ "$WAIT_SECONDS" -gt 0 ]]; then
    sleep "$WAIT_SECONDS"
fi

# Build capture command
CAPTURE_CMD="tmux capture-pane -t \"$SESSION_NAME\" -p"

if [[ "$COLORS" == true ]]; then
    CAPTURE_CMD="$CAPTURE_CMD -e"
fi

if [[ "$START_LINE" != "-" ]]; then
    CAPTURE_CMD="$CAPTURE_CMD -S $START_LINE"
fi

if [[ "$END_LINE" != "-" ]]; then
    CAPTURE_CMD="$CAPTURE_CMD -E $END_LINE"
fi

# Get project root for session logs directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SESSION_DIR="$PROJECT_ROOT/debug/tmux-sessions/$SESSION_NAME"

# Execute capture
if [[ -n "$OUTPUT_FILE" ]]; then
    eval "$CAPTURE_CMD" > "$OUTPUT_FILE"
else
    # Capture to variable first
    CAPTURED_OUTPUT=$(eval "$CAPTURE_CMD")
    
    # Auto-save capture if enabled
    if [[ "$AUTO_SAVE" == true ]]; then
        mkdir -p "$SESSION_DIR"
        
        # Get sequence number from counter file
        SEQUENCE_FILE="$SESSION_DIR/.capture-sequence"
        if [[ -f "$SEQUENCE_FILE" ]]; then
            SEQUENCE=$(cat "$SEQUENCE_FILE")
        else
            SEQUENCE=0
        fi
        SEQUENCE=$((SEQUENCE + 1))
        echo "$SEQUENCE" > "$SEQUENCE_FILE"
        
        TIMESTAMP=$(date +%Y%m%d-%H%M%S)
        ISO_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
        
        # Build filename with sequence prefix
        SEQUENCE_PADDED=$(printf "%03d" "$SEQUENCE")
        if [[ -n "$LABEL" ]]; then
            CAPTURE_FILE="$SESSION_DIR/capture-${SEQUENCE_PADDED}-${LABEL}.txt"
        else
            CAPTURE_FILE="$SESSION_DIR/capture-${SEQUENCE_PADDED}-${TIMESTAMP}.txt"
        fi
        
        # Get the last command from commands.yaml (if exists)
        AFTER_COMMAND="null"
        if [[ -f "$SESSION_DIR/commands.yaml" ]]; then
            # Get the last input from the commands.yaml file
            LAST_INPUT=$(grep '^  input:' "$SESSION_DIR/commands.yaml" | tail -1 | sed 's/^  input: //')
            if [[ -n "$LAST_INPUT" ]]; then
                AFTER_COMMAND="$LAST_INPUT"
            fi
        fi
        
        # Get terminal dimensions
        TERM_WIDTH=$(tmux display-message -t "$SESSION_NAME" -p '#{window_width}' 2>/dev/null || echo "unknown")
        TERM_HEIGHT=$(tmux display-message -t "$SESSION_NAME" -p '#{window_height}' 2>/dev/null || echo "unknown")
        
        # Write capture with YAML front-matter
        cat > "$CAPTURE_FILE" << EOF
---
sequence: $SEQUENCE
label: ${LABEL:-null}
timestamp: $ISO_TIMESTAMP
after_command: $AFTER_COMMAND
dimensions:
  width: $TERM_WIDTH
  height: $TERM_HEIGHT
---
$CAPTURED_OUTPUT
EOF
        # Print capture path to stderr so it can be captured separately
        echo "$CAPTURE_FILE" >&2
    fi
    
    # Output to stdout
    echo "$CAPTURED_OUTPUT"
fi
