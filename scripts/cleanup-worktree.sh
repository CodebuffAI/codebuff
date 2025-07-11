#!/bin/bash

# Script to clean up a git worktree
# Usage: ./scripts/cleanup-worktree.sh <worktree-name>

set -e

# Check if worktree name is provided
if [ $# -eq 0 ]; then
    echo "Usage: $0 <worktree-name>"
    echo "Example: $0 feature-branch"
    exit 1
fi

WORKTREE_NAME="$1"
WORKTREES_DIR="../codebuff-worktrees"
WORKTREE_PATH="$WORKTREES_DIR/$WORKTREE_NAME"

echo "Cleaning up worktree: $WORKTREE_NAME"

# Check if worktree exists
if [ ! -d "$WORKTREE_PATH" ]; then
    echo "❌ Worktree '$WORKTREE_NAME' not found at $WORKTREE_PATH"
    exit 1
fi

# Remove the git worktree
echo "Removing git worktree..."
git worktree remove "$WORKTREE_PATH" --force

# Clean up any worktree-specific files that might be left behind
if [ -f "$WORKTREE_PATH/.env.worktree" ]; then
    rm -f "$WORKTREE_PATH/.env.worktree"
fi

# Clean up any remaining files
if [ -d "$WORKTREE_PATH" ]; then
    echo "Cleaning up remaining files..."
    rm -rf "$WORKTREE_PATH"
fi

echo "✅ Worktree '$WORKTREE_NAME' cleaned up successfully!"
