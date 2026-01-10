# tmux CLI Testing Scripts

Helper scripts for testing the Codebuff CLI using tmux. These scripts abstract away the complexity of tmux communication, particularly the **bracketed paste mode** requirement.

## Features

- **Automatic bracketed paste mode** - Input is wrapped in escape sequences so characters don't get dropped
- **Automatic session logs** - Every capture is saved to `debug/tmux-sessions/{session}/` for debugging
- **Paper trail** - Both the subagent and parent agent can review what the CLI displayed

## Why These Scripts?

The Codebuff CLI uses OpenTUI for rendering, which processes keyboard input character-by-character. When tmux sends characters rapidly via `send-keys`, they get dropped or garbled. These scripts automatically wrap input in bracketed paste escape sequences (`\e[200~...\e[201~`), which tells the terminal to process the input atomically.

**Without these scripts:**
```bash
# ❌ Characters get dropped!
tmux send-keys -t session "hello world"
# Result: Only "d" appears in the input!
```

**With these scripts:**
```bash
# ✅ Works correctly
./scripts/tmux/tmux-send.sh session "hello world"
# Result: "hello world" appears correctly
```

## Quick Start

```bash
# Start a test session
SESSION=$(./scripts/tmux/tmux-cli.sh start)
echo "Started session: $SESSION"

# Send a command
./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"

# Wait and capture output
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 2

# Clean up
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

## Scripts

### `tmux-cli.sh` (Unified Interface)

The main entry point with subcommands:

```bash
./scripts/tmux/tmux-cli.sh start      # Start a session
./scripts/tmux/tmux-cli.sh send       # Send input
./scripts/tmux/tmux-cli.sh capture    # Capture output
./scripts/tmux/tmux-cli.sh stop       # Stop a session
./scripts/tmux/tmux-cli.sh list       # List sessions
./scripts/tmux/tmux-cli.sh help       # Show help
```

### `tmux-start.sh`

Start a new tmux session with the CLI.

```bash
# Default settings
./scripts/tmux/tmux-start.sh
# Output: cli-test-1234567890

# Custom session name
./scripts/tmux/tmux-start.sh --name my-test

# Custom dimensions
./scripts/tmux/tmux-start.sh -w 160 -h 40

# Custom wait time for CLI initialization
./scripts/tmux/tmux-start.sh --wait 6
```

### `tmux-send.sh`

Send input to a running session.

```bash
# Send text (auto-presses Enter)
./scripts/tmux/tmux-send.sh SESSION "your prompt"

# Send without pressing Enter
./scripts/tmux/tmux-send.sh SESSION "partial" --no-enter

# Send special keys
./scripts/tmux/tmux-send.sh SESSION --key Escape
./scripts/tmux/tmux-send.sh SESSION --key C-c
./scripts/tmux/tmux-send.sh SESSION --key Enter
```

### `tmux-capture.sh`

Capture output from a session. **Automatically saves captures** to `debug/tmux-sessions/{session}/`.

```bash
# Basic capture (auto-saves to session logs)
./scripts/tmux/tmux-capture.sh SESSION

# Capture with a descriptive label (recommended)
./scripts/tmux/tmux-capture.sh SESSION --label "after-help-command"
# Saves to: debug/tmux-sessions/SESSION/capture-{timestamp}-after-help-command.txt

# Wait before capturing
./scripts/tmux/tmux-capture.sh SESSION --wait 3

# Capture without auto-saving to session logs
./scripts/tmux/tmux-capture.sh SESSION --no-save

# Preserve colors
./scripts/tmux/tmux-capture.sh SESSION --colors

# Save to specific file (disables auto-save)
./scripts/tmux/tmux-capture.sh SESSION -o output.txt
```

### `tmux-stop.sh`

Stop/kill sessions.

```bash
# Stop specific session
./scripts/tmux/tmux-stop.sh SESSION

# Stop all test sessions
./scripts/tmux/tmux-stop.sh --all

# List sessions first, then stop
./scripts/tmux/tmux-stop.sh --list SESSION
```

## Example: Full Test Workflow

```bash
#!/bin/bash

# Start session
SESSION=$(./scripts/tmux/tmux-cli.sh start --name auth-test)
echo "Testing authentication in: $SESSION"

# Verify CLI started (capture auto-saved with label)
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"

# Send /status command
./scripts/tmux/tmux-cli.sh send "$SESSION" "/status"
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 2 --label "after-status"

# Test a prompt
./scripts/tmux/tmux-cli.sh send "$SESSION" "hello world"
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 5 --label "after-prompt"

# Clean up
./scripts/tmux/tmux-cli.sh stop "$SESSION"
echo "Test complete!"

# View all session logs
ls -la debug/tmux-sessions/$SESSION/
```

## Session Logs Directory Structure

```
debug/tmux-sessions/
└── cli-test-1234567890/
    ├── session-info.yaml             # Session metadata (YAML format)
    ├── commands.yaml                 # Log of all commands sent (YAML array)
    ├── capture-001-initial-state.txt # Captures with YAML front-matter
    ├── capture-002-after-status.txt
    └── capture-003-after-prompt.txt
```

### Session Info (session-info.yaml)

```yaml
session: cli-test-1234567890
started: 2025-01-01T12:00:00Z
started_local: Wed Jan  1 12:00:00 PST 2025
dimensions:
  width: 120
  height: 30
status: active
```

### Commands Log (commands.yaml)

The `commands.yaml` file records every input sent to the CLI as a YAML array:

```yaml
- timestamp: 2025-01-01T12:00:05Z
  type: text
  input: "/help"
  auto_enter: true

- timestamp: 2025-01-01T12:00:10Z
  type: text
  input: "hello world"
  auto_enter: true

- timestamp: 2025-01-01T12:00:15Z
  type: key
  input: "Escape"

- timestamp: 2025-01-01T12:00:20Z
  type: text
  input: "partial input"
  auto_enter: false
```

### Capture Files with YAML Front-Matter

Each capture file includes YAML front-matter with metadata:

```yaml
---
sequence: 1
label: initial-state
timestamp: 2025-01-01T12:00:30Z
after_command: null
dimensions:
  width: 120
  height: 30
---
[actual terminal output below]
```

The front-matter provides:
- **sequence**: Order of captures (1, 2, 3, ...)
- **label**: Descriptive label if provided via `--label`
- **timestamp**: ISO 8601 timestamp
- **after_command**: The last command sent before this capture (or `null`)
- **dimensions**: Terminal dimensions at capture time

This structured format enables both human reading and programmatic parsing (AI agents, viewers, etc.).

## Debugging

### Attach to a Session Interactively

```bash
tmux attach -t SESSION_NAME
# Detach with Ctrl+B, D
```

### List All Sessions

```bash
./scripts/tmux/tmux-cli.sh list
# or
tmux list-sessions
```

### Check If Session Exists

```bash
tmux has-session -t SESSION_NAME && echo "exists" || echo "not found"
```

## Prerequisites

- **tmux** must be installed:
  - macOS: `brew install tmux`
  - Ubuntu: `sudo apt-get install tmux`
  - Arch: `sudo pacman -S tmux`

## Used By

These scripts are used by the `@cli-ui-tester` agent (`.agents/cli-ui-tester.ts`) to automate CLI testing.
