#!/usr/bin/env bash

#######################################################################
# tmux-stop.sh - Stop a tmux session
#######################################################################
#
# DESCRIPTION:
#   Kills a tmux session. Use this to clean up after testing.
#   Silently succeeds if session doesn't exist (idempotent).
#
# USAGE:
#   ./scripts/tmux/tmux-stop.sh SESSION_NAME [OPTIONS]
#
# ARGUMENTS:
#   SESSION_NAME        Name of the tmux session to stop
#
# OPTIONS:
#   --all               Stop ALL cli-test-* sessions
#   --list              List all active tmux sessions first
#   --help              Show this help message
#
# EXAMPLES:
#   # Stop a specific session
#   ./scripts/tmux/tmux-stop.sh cli-test-123
#
#   # Stop all test sessions
#   ./scripts/tmux/tmux-stop.sh --all
#
#   # List sessions then stop one
#   ./scripts/tmux/tmux-stop.sh --list cli-test-123
#
# EXIT CODES:
#   0 - Success (session stopped or already doesn't exist)
#   1 - Error (invalid arguments)
#
#######################################################################

set -e

# Defaults
STOP_ALL=false
LIST_FIRST=false

# Check minimum arguments
if [[ $# -lt 1 ]]; then
    echo "Usage: $0 SESSION_NAME [OPTIONS]" >&2
    echo "       $0 --all" >&2
    echo "Run with --help for more information" >&2
    exit 1
fi

# First argument handling
SESSION_NAME=""

# Handle --help and --all as first arg
case "$1" in
    --help)
        head -n 40 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
        exit 0
        ;;
    --all)
        STOP_ALL=true
        shift
        ;;
    --list)
        LIST_FIRST=true
        shift
        if [[ $# -gt 0 && "$1" != "--"* ]]; then
            SESSION_NAME="$1"
            shift
        fi
        ;;
    *)
        SESSION_NAME="$1"
        shift
        ;;
esac

# Parse remaining arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --all)
            STOP_ALL=true
            shift
            ;;
        --list)
            LIST_FIRST=true
            shift
            ;;
        --help)
            head -n 40 "$0" | tail -n +2 | sed 's/^# //' | sed 's/^#//'
            exit 0
            ;;
        *)
            if [[ -z "$SESSION_NAME" ]]; then
                SESSION_NAME="$1"
            fi
            shift
            ;;
    esac
done

# List sessions if requested
if [[ "$LIST_FIRST" == true ]]; then
    echo "Active tmux sessions:"
    tmux list-sessions 2>/dev/null || echo "  (none)"
    echo ""
fi

# Stop all test sessions
if [[ "$STOP_ALL" == true ]]; then
    # Get all cli-test-* sessions
    SESSIONS=$(tmux list-sessions -F '#{session_name}' 2>/dev/null | grep '^cli-test-' || true)
    
    if [[ -z "$SESSIONS" ]]; then
        echo "No cli-test-* sessions found"
        exit 0
    fi
    
    COUNT=0
    while IFS= read -r session; do
        tmux kill-session -t "$session" 2>/dev/null && ((COUNT++)) || true
    done <<< "$SESSIONS"
    
    echo "Stopped $COUNT session(s)"
    exit 0
fi

# Check if session name was provided
if [[ -z "$SESSION_NAME" ]]; then
    echo "❌ No session name specified" >&2
    echo "   Use --all to stop all test sessions" >&2
    exit 1
fi

# Stop the specific session (silently succeed if not found)
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
