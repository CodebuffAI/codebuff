#!/bin/bash

# Script to clean up git worktrees
# Usage: ./scripts/cleanup-worktree.sh [worktree-name]
# If no worktree name is provided, cleans up ALL worktrees

# Don't exit on errors - continue cleaning up other worktrees
set +e

WORKTREES_DIR="../codebuff-worktrees"

# Function to clean up a single worktree
cleanup_worktree() {
    local WORKTREE_NAME="$1"
    local WORKTREE_PATH="$WORKTREES_DIR/$WORKTREE_NAME"
    
    echo "Cleaning up worktree: $WORKTREE_NAME"
    
    # Check if worktree exists in git worktree list
    if git worktree list | grep -q "$WORKTREE_PATH"; then
        echo "  Removing git worktree..."
        # First try regular remove, then force if it fails (handles dirty worktrees)
        if ! git worktree remove "$WORKTREE_PATH" 2>/dev/null; then
            echo "  ⚠️  Worktree has uncommitted changes or is locked, forcing removal..."
            git worktree remove "$WORKTREE_PATH" --force 2>/dev/null || echo "  ⚠️  Failed to remove worktree, continuing..."
        fi
    else
        echo "  ⚠️  Worktree not found in git worktree list (may already be removed)"
    fi
    
    # Clean up any worktree-specific files that might be left behind
    if [ -f "$WORKTREE_PATH/.env.development.local" ]; then
        rm -f "$WORKTREE_PATH/.env.development.local" 2>/dev/null || true
    fi
    # Also clean up legacy .env.development and .env.worktree if present
    if [ -f "$WORKTREE_PATH/.env.development" ]; then
        rm -f "$WORKTREE_PATH/.env.development" 2>/dev/null || true
    fi
    if [ -f "$WORKTREE_PATH/.env.worktree" ]; then
        rm -f "$WORKTREE_PATH/.env.worktree" 2>/dev/null || true
    fi
    
    # Clean up any remaining files
    if [ -d "$WORKTREE_PATH" ]; then
        echo "  Cleaning up remaining files..."
        rm -rf "$WORKTREE_PATH" 2>/dev/null || echo "  ⚠️  Failed to remove directory, continuing..."
    fi
    
    echo "  ✅ Worktree '$WORKTREE_NAME' cleanup complete"
    echo ""
}

if [ $# -eq 0 ]; then
    # No arguments - clean up ALL worktrees
    echo "No worktree name provided - cleaning up ALL worktrees"
    echo ""
    
    if [ -d "$WORKTREES_DIR" ]; then
        # Get all worktree directories
        for worktree in "$WORKTREES_DIR"/*; do
            if [ -d "$worktree" ]; then
                WORKTREE_NAME=$(basename "$worktree")
                cleanup_worktree "$WORKTREE_NAME"
            fi
        done
        
        # Try to remove the worktrees directory itself
        rmdir "$WORKTREES_DIR" 2>/dev/null && echo "✅ Removed worktrees directory" || echo "⚠️  Could not remove worktrees directory (may still contain files)"
    else
        echo "No worktrees directory found at: $WORKTREES_DIR"
    fi
else
    # Single worktree cleanup
    WORKTREE_NAME="$1"
    cleanup_worktree "$WORKTREE_NAME"
fi

echo "All worktree cleanup operations complete!"
