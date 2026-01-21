#!/usr/bin/env bash

#######################################################################
# tmux-cli.sh - Unified TUI testing helper using tmux
#######################################################################
#
# DESCRIPTION:
#   A unified script for testing TUI applications using tmux.
#   Provides subcommands for starting, sending input, capturing output,
#   and stopping test sessions. Works with any TUI app (Codebuff,
#   Claude Code, Codex, custom apps, etc.).
#
# USAGE:
#   ./scripts/tmux/tmux-cli.sh <command> [arguments]
#
# COMMANDS:
#   start               Start a new TUI test session
#   send                Send input to a session (uses bracketed paste)
#   capture             Capture output from a session
#   stop                Stop a session
#   list                List all active tmux sessions
#   help                Show this help message
#
# QUICK START:
#   # Start a test session with a custom command
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude")
#   echo "Started session: $SESSION"
#
#   # Send a command
#   ./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"
#
#   # Capture output with a label (auto-saves screenshot)
#   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "after-help" --wait 2
#
#   # Clean up
#   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
#
# SESSION LOGS:
#   Captures are automatically saved to debug/tmux-sessions/{session}/
#   Use --label to add descriptive names to capture files.
#
# EXAMPLES:
#   # Test any TUI app
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "codex chat")
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "python my_app.py")
#
#   # Test Codebuff (default when no --command specified)
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --name my-test)
#   ./scripts/tmux/tmux-cli.sh send "$SESSION" "hello world"
#   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 3
#   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
#
#   # Test a compiled Codebuff binary
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --binary)
#   # Or with custom path:
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --binary ./path/to/codebuff)
#
#   # Stop all test sessions
#   ./scripts/tmux/tmux-cli.sh stop --all
#
#   # Get help for a specific command
#   ./scripts/tmux/tmux-cli.sh start --help
#
# INDIVIDUAL SCRIPTS:
#   For more options, use the individual scripts directly:
#   - scripts/tmux/tmux-start.sh
#   - scripts/tmux/tmux-send.sh
#   - scripts/tmux/tmux-capture.sh
#   - scripts/tmux/tmux-stop.sh
#
#######################################################################

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

show_help() {
    head -n 58 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
}

show_short_help() {
    echo "Usage: $0 <command> [arguments]"
    echo ""
    echo "Commands:"
    echo "  start     Start a new TUI test session"
    echo "  send      Send input to a session"
    echo "  capture   Capture output from a session"
    echo "  stop      Stop a session"
    echo "  list      List all active tmux sessions"
    echo "  help      Show full help message"
    echo ""
    echo "Run '$0 <command> --help' for command-specific help"
}

# Check for command
if [[ $# -lt 1 ]]; then
    show_short_help
    exit 1
fi

COMMAND="$1"
shift

case "$COMMAND" in
    start)
        # Run tmux-start.sh and parse its JSON output
        # This gives callers a plain session name for backward compatibility
        JSON_OUTPUT=$("$SCRIPT_DIR/tmux-start.sh" "$@" 2>&1) || true
        
        # Check if output looks like JSON
        if [[ "$JSON_OUTPUT" == "{"* ]]; then
            # Parse JSON to extract session name or error
            # Use grep/sed for portability (no jq dependency)
            if echo "$JSON_OUTPUT" | grep -q '"status":"success"'; then
                # Extract sessionName value
                SESSION_NAME=$(echo "$JSON_OUTPUT" | sed -n 's/.*"sessionName":"\([^"]*\)".*/\1/p')
                if [[ -n "$SESSION_NAME" ]]; then
                    echo "$SESSION_NAME"
                    exit 0
                else
                    echo "Failed to extract session name from: $JSON_OUTPUT" >&2
                    exit 1
                fi
            else
                # Extract error message
                ERROR_MSG=$(echo "$JSON_OUTPUT" | sed -n 's/.*"error":"\([^"]*\)".*/\1/p')
                echo "${ERROR_MSG:-Failed to start session}" >&2
                exit 1
            fi
        else
            # Not JSON - pass through as-is (plain mode or unexpected output)
            echo "$JSON_OUTPUT"
            exit 0
        fi
        ;;
    send)
        exec "$SCRIPT_DIR/tmux-send.sh" "$@"
        ;;
    capture)
        exec "$SCRIPT_DIR/tmux-capture.sh" "$@"
        ;;
    stop)
        exec "$SCRIPT_DIR/tmux-stop.sh" "$@"
        ;;
    list)
        echo "Active tmux sessions:"
        tmux list-sessions 2>/dev/null || echo "  (none)"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $COMMAND" >&2
        echo ""
        show_short_help
        exit 1
        ;;
esac
