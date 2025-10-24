#!/usr/bin/env bash

# Test script for SDK file hooks
# This script validates that CLI typecheck and build run when SDK files change

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TEST_FILE="$PROJECT_ROOT/sdk/src/test-hook-trigger.ts"



# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Array to store errors
declare -a ERRORS=()

# Function to run a command and capture errors
run_hook() {
    local name="$1"
    local command="$2"
    local cwd="$3"
    
    local output
    local exit_code
    
    # Capture output and exit code
    output=$(cd "$PROJECT_ROOT/$cwd" && eval "$command" 2>&1)
    exit_code=$?
    
    if [ $exit_code -ne 0 ]; then
        echo -e "${RED}❌ $name failed (exit code: $exit_code)${NC}"
        echo "   Command: $command"
        echo "   CWD: $cwd"
        echo ""
        echo "Output:"
        echo "$output"
        echo ""
        ERRORS+=("$name (exit code: $exit_code)")
    fi
}

# Create a temporary SDK file to trigger the hooks
cat > "$TEST_FILE" << 'EOF' 2>/dev/null
// Temporary file to trigger SDK file hooks
export const testHookTrigger = true
EOF

# Give file system a moment to register the change
sleep 1

# Run hooks in parallel using background processes
(
    run_hook "cli-typecheck-on-sdk-changes" "bun run typecheck" "cli"
) &
PID1=$!

(
    run_hook "cli-build-on-sdk-changes" "bun run build" "cli"
) &
PID2=$!

# Wait for both to complete
wait $PID1
wait $PID2

# Clean up test file
rm -f "$TEST_FILE" 2>/dev/null

# Report results - only show output if there are errors
if [ ${#ERRORS[@]} -ne 0 ]; then
    echo -e "${RED}❌ Hook validation failed with ${#ERRORS[@]} error(s):${NC}"
    echo ""
    echo "Errors:"
    for error in "${ERRORS[@]}"; do
        echo -e "  ${RED}• $error${NC}"
    done
    echo ""
    exit 1
fi

# Silent success
exit 0
