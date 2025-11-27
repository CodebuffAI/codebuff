# Plan: Immediate Bash Command Execution with Ephemeral Preview

## Overview
Execute bash commands immediately in an ephemeral "bash window" overlay that shows real-time terminal output. Once the command completes, add it to the chat message history to maintain full context while keeping the immediate feedback responsive.

## Requirements

### Immediate Execution in Ephemeral Window
- When user submits bash command in bash mode, execute immediately (don't queue)
- Show execution in an ephemeral overlay/window near the input area
- Display command as it runs with faithful terminal output (stdout, stderr, colors, formatting)
- Block input while command runs (show loading state)
- Overlay should be scrollable for long outputs
- Show exit code and execution time

### Deferred History Addition
- After command completes, add the command + output to chat message history
- Wait until any currently running agent response completes first to avoid confusion
- If agent is streaming, queue the bash message to be added after agent finishes
- Message format should match current bash message format (user message with `!cmd`, system message with tool result)

### Terminal Output Fidelity
- Preserve ANSI colors and formatting from terminal
- Show both stdout and stderr (differentiated if possible)
- Display command exit code
- Show execution duration
- Handle streaming output (show output as it arrives, not just at the end)

### Command History Navigation
- Maintain bash command history accessible via ↑/↓ arrows in bash mode
- History persists across sessions
- Separate from regular chat input history

### Edge Cases
- If bash command submitted while agent is streaming, execute immediately in overlay but defer adding to history
- If multiple bash commands queued, execute them sequentially
- Allow Ctrl+C to cancel running command
- Handle commands with no output gracefully

## Notes
- The ephemeral overlay should feel like a mini terminal window
- Consider using a terminal emulator component if needed for proper ANSI rendering
- Exit code should be visually distinct (green for 0, red for non-zero)
- The overlay should position intelligently (above input if output is short, take more space if needed)
- When command is added to history after agent completes, it should scroll into view naturally

## Relevant Files
- `cli/src/commands/router.ts` - Bash command execution, needs to handle immediate execution
- `cli/src/state/chat-store.ts` - May need state for bash overlay visibility and pending bash messages
- `cli/src/components/chat-input-bar.tsx` - Where bash overlay will render
- `cli/src/hooks/use-send-message.ts` - Queue management for deferred history addition
- `cli/src/hooks/use-input-history.ts` - Pattern for bash command history
- `cli/src/utils/input-modes.ts` - Bash mode configuration
- `cli/src/hooks/use-chat-keyboard.ts` - Arrow key navigation for bash history
- New component needed: BashOutputOverlay or similar for ephemeral display

## Current State (as of this plan)

A partial fix for bash mode queueing was just implemented, but the full ephemeral execution design is not yet done. Here's what exists:

### What Was Recently Changed
1. **`cli/src/commands/router.ts`**: Added `executeBashCommand()` helper function and updated bash mode handler to queue commands when streaming/busy. The handler detects `!` prefix for bash commands.

2. **`cli/src/chat.tsx`**: Updated `useMessageQueue` callback to route queued messages through `routeUserPrompt` instead of calling `sendMessage` directly. This ensures bash commands from the queue get executed properly.

### Current Flow (What Needs to Change)
1. User enters bash mode (types `!`)
2. User types command and hits Enter
3. Command executes via `runTerminalCommand` from SDK
4. Output is added to chat history immediately as a tool result block
5. If agent is streaming, command gets queued instead

### Target Flow (What This Plan Describes)
1. User enters bash mode (types `!`)
2. User types command and hits Enter
3. **NEW**: Command executes immediately in ephemeral overlay
4. **NEW**: Overlay shows real-time streaming output with ANSI colors
5. **NEW**: Input is blocked while command runs
6. **NEW**: After command completes, message is added to chat history (deferred if agent is streaming)
7. **NEW**: Overlay can be dismissed once output is in history

### Key SDK Functions
- `runTerminalCommand` from `@codebuff/sdk` - Used to execute terminal commands
- Returns `[{ value: { stdout, stderr, exitCode } }]`
- Currently runs synchronously (SYNC mode)
- May need to use different mode for streaming output

### Existing Patterns to Reference
- **Suggestion Menu**: See `cli/src/components/chat-input-bar.tsx` for how overlays are positioned near input
- **Tool Result Display**: See `cli/src/components/tools/run-terminal-command.tsx` for terminal output rendering
- **Input History**: See `cli/src/hooks/use-input-history.ts` for history navigation pattern
- **Bash Mode Tests**: See `cli/src/__tests__/bash-mode.test.ts` for expected behaviors

### Testing
- Run `cd cli && bun test` to run all CLI tests
- Run `cd cli && bun run typecheck` to check types
- Bash mode tests are in `cli/src/__tests__/bash-mode.test.ts`
