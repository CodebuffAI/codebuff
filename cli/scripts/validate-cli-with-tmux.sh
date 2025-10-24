#!/usr/bin/env bash

# Simple tmux-based CLI validation script
# Usage: ./cli/scripts/validate-cli-with-tmux.sh

set -e

SESSION_NAME="cli-validation-$(date +%s)"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"



# Check if tmux is available
if ! command -v tmux &> /dev/null; then
    echo "❌ tmux not found"
    echo ""
    echo "📦 Installation:"
    echo "  macOS:   brew install tmux"
    echo "  Ubuntu:  sudo apt-get install tmux"
    echo "  Arch:    sudo pacman -S tmux"
    echo ""
    exit 1
fi



# Create tmux session running CLI
tmux new-session -d -s "$SESSION_NAME" \
    -x 120 -y 30 \
    "cd $PROJECT_ROOT && bun --cwd=cli run dev 2>&1" 2>/dev/null

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
