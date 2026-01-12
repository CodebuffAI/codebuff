#!/usr/bin/env bash

# Simple tmux-based CLI validation script
# Usage: ./cli/scripts/validate-cli-with-tmux.sh
#
# Uses scripts/tmux/tmux-start.sh as the single source of truth for
# terminal dimensions and session creation.

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# Use tmux-start.sh to create the session (handles tmux availability check too)
SESSION_NAME=$("$PROJECT_ROOT/scripts/tmux/tmux-start.sh" --name "cli-validation-$(date +%s)" --wait 2)

# Capture output at intervals
sleep 2
OUTPUT_2S=$(tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null)

sleep 3
OUTPUT_5S=$(tmux capture-pane -t "$SESSION_NAME" -p 2>/dev/null)

# Check for errors in output
if echo "$OUTPUT_5S" | grep -qi "error\|failed\|exception"; then
    echo "❌ CLI validation detected errors:"
    echo ""
    echo "--- Output (2s) ---"
    echo "$OUTPUT_2S"
    echo "--- End Output ---"
    echo ""
    echo "--- Output (5s) ---"
    echo "$OUTPUT_5S"
    echo "--- End Output ---"
    echo ""
    tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true
    exit 1
fi

# Cleanup
tmux kill-session -t "$SESSION_NAME" 2>/dev/null || true

# Silent success
exit 0
