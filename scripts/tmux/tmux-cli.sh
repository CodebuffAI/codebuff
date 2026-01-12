#!/usr/bin/env bash

#######################################################################
# tmux-cli.sh - Unified CLI testing helper using tmux
#######################################################################
#
# DESCRIPTION:
#   A unified script for testing the Codebuff CLI using tmux.
#   Provides subcommands for starting, sending input, capturing output,
#   and stopping test sessions.
#
# USAGE:
#   ./scripts/tmux/tmux-cli.sh <command> [arguments]
#
# COMMANDS:
#   start               Start a new CLI test session
#   send                Send input to a session (uses bracketed paste)
#   capture             Capture output from a session
#   stop                Stop a session
#   list                List all active tmux sessions
#   help                Show this help message
#
# QUICK START:
#   # Start a test session
#   SESSION=$(./scripts/tmux/tmux-cli.sh start)
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
#   # Full test workflow
#   SESSION=$(./scripts/tmux/tmux-cli.sh start --name my-test)
#   ./scripts/tmux/tmux-cli.sh send "$SESSION" "hello world"
#   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 3
#   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
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
    echo "  start     Start a new CLI test session"
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
        exec "$SCRIPT_DIR/tmux-start.sh" "$@"
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
