# tmux Knowledge for CLI Testing

This document covers essential knowledge for using tmux to test and automate the Codebuff CLI.

## Recommended: Use the Helper Scripts

**For most CLI testing, use the helper scripts in `scripts/tmux/`** instead of raw tmux commands. These scripts handle bracketed paste mode, session management, and logging automatically.

### Quick Start

```bash
# Start a test session
SESSION=$(./scripts/tmux/tmux-cli.sh start)

# Send a command
./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"

# Capture output (auto-saves to debug/tmux-sessions/)
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 2 --label "after-help"

# Stop the session
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

### Available Scripts

| Script | Purpose |
|--------|--------|
| `tmux-cli.sh` | Unified interface with subcommands (start, send, capture, stop, list) |
| `tmux-start.sh` | Start a CLI test session with custom name/dimensions |
| `tmux-send.sh` | Send input using bracketed paste mode (handles escaping) |
| `tmux-capture.sh` | Capture terminal output with YAML metadata |
| `tmux-stop.sh` | Stop individual or all test sessions |

### Session Logs

All session data is saved to `debug/tmux-sessions/{session}/` in YAML format:
- `session-info.yaml` - Session metadata
- `commands.yaml` - All commands sent with timestamps
- `capture-*.txt` - Terminal captures with YAML front-matter

### Why Use Helper Scripts?

1. Automatic **bracketed paste mode** so CLI input is reliable and characters are not dropped.
2. Automatic **session logging** in `debug/tmux-sessions/{session}/` so you always have a reproducible paper trail.
3. A shared **YAML format** consumed by both humans (via `tmux-viewer` TUI) and AIs (via `--json` output and the `@cli-ui-tester` agent).

### Viewing Session Data

Use the **tmux-viewer** to inspect sessions:

```bash
# Interactive TUI (for humans)
bun .agents/tmux-viewer/index.tsx <session-name>

# JSON output (for AI consumption)
bun .agents/tmux-viewer/index.tsx <session-name> --json

# List available sessions
bun .agents/tmux-viewer/index.tsx --list
```

### CLI Tmux Tester Agent

For automated testing, use the `@cli-ui-tester` agent which wraps all of this with structured output reporting.

See `scripts/tmux/README.md` for comprehensive documentation.

---

## Manual Approach (Understanding the Internals)

The sections below explain how tmux communication with the CLI works at a low level. This is useful for understanding why the helper scripts exist and for debugging edge cases.

### Critical: Sending Input to the CLI

**Standard `tmux send-keys` does NOT work with the Codebuff CLI.** Characters are dropped or garbled due to how OpenTUI handles keyboard input.

### The Problem

```bash
# ❌ BROKEN: Characters get dropped - only last character appears
tmux send-keys -t session "hello world"
tmux send-keys -t session Enter
# Result: Only "d" appears in the input field!
```

### The Solution: Bracketed Paste Mode

Always wrap input in bracketed paste escape sequences (`\e[200~...\e[201~`):

```bash
# ✅ WORKS: Use bracketed paste escape sequences
tmux send-keys -t session $'\e[200~hello world\e[201~'
tmux send-keys -t session Enter
# Result: "hello world" appears correctly!
```

### Why This Happens

- OpenTUI's keyboard input handling processes individual keystrokes
- When characters arrive rapidly via `send-keys`, they can be dropped or misinterpreted
- Bracketed paste mode (`\e[200~...\e[201~`) signals that the input is a paste operation
- Paste events are processed atomically, preserving all characters

### What Works Without Bracketed Paste

- Control keys: `Enter`, `C-c`, `C-u`, `C-d`, `Escape`
- Arrow keys: `Up`, `Down`, `Left`, `Right`
- Function keys and special keys
- Single characters with long delays (200ms+) - but this is slow and unreliable

## Helper Functions

### Bash Helper

```bash
# Send text to Codebuff CLI in tmux
send_to_codebuff() {
  local session="$1"
  local text="$2"
  # Use bracketed paste mode for reliable input
  tmux send-keys -t "$session" $'\e[200~'"$text"$'\e[201~'
}

# Usage:
send_to_codebuff my-session "fix the bug in main.ts"
tmux send-keys -t my-session Enter
```

### TypeScript Helper

```typescript
async function sendInput(sessionName: string, text: string): Promise<void> {
  // Use bracketed paste mode for reliable input
  await tmux(['send-keys', '-t', sessionName, '-l', `\x1b[200~${text}\x1b[201~`])
}

// Usage:
await sendInput(sessionName, 'fix the bug')
await tmux(['send-keys', '-t', sessionName, 'Enter'])
```

## Common tmux Patterns

### Starting the CLI in tmux

```bash
# Create a detached session running the CLI
tmux new-session -d -s codebuff-test -x 120 -y 30 'bun run src/index.tsx'

# Wait for CLI to initialize
sleep 3
```

### Sending Input and Capturing Output

```bash
# Send input using bracketed paste
tmux send-keys -t codebuff-test $'\e[200~what files are in this project?\e[201~'
tmux send-keys -t codebuff-test Enter

# Wait for response
sleep 5

# Capture output
tmux capture-pane -t codebuff-test -p
```

### Cleaning Up

```bash
# Kill the session when done
tmux kill-session -t codebuff-test 2>/dev/null
```

## Complete Example Script

```bash
#!/bin/bash
SESSION="codebuff-test-$$"

# Start CLI
tmux new-session -d -s "$SESSION" -x 120 -y 30 'bun --cwd=cli run dev'
sleep 4

# Send a prompt
tmux send-keys -t "$SESSION" $'\e[200~list the files in src/\e[201~'
tmux send-keys -t "$SESSION" Enter
sleep 3

# Capture and display output
echo "=== CLI Output ==="
tmux capture-pane -t "$SESSION" -p

# Cleanup
tmux kill-session -t "$SESSION" 2>/dev/null
```

## TypeScript Test Pattern

```typescript
import { spawn } from 'child_process'

function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    proc.stdout?.on('data', (data) => { stdout += data.toString() })
    proc.on('close', (code) => {
      code === 0 ? resolve(stdout) : reject(new Error('tmux failed'))
    })
  })
}

async function sendInput(session: string, text: string): Promise<void> {
  await tmux(['send-keys', '-t', session, '-l', `\x1b[200~${text}\x1b[201~`])
}

async function testCLI() {
  const session = `test-${Date.now()}`
  
  try {
    // Start CLI
    await tmux(['new-session', '-d', '-s', session, '-x', '120', '-y', '30', 
                'bun', 'run', 'src/index.tsx'])
    await sleep(4000)
    
    // Send input
    await sendInput(session, 'hello world')
    await tmux(['send-keys', '-t', session, 'Enter'])
    await sleep(2000)
    
    // Capture output
    const output = await tmux(['capture-pane', '-t', session, '-p'])
    console.log(output)
    
  } finally {
    await tmux(['kill-session', '-t', session]).catch(() => {})
  }
}
```

## Debugging Tips

### Attach to a Session

To debug interactively, attach to the tmux session:

```bash
tmux attach -t codebuff-test
```

### Check Session Exists

```bash
tmux has-session -t codebuff-test 2>/dev/null && echo "exists" || echo "not found"
```

### List All Sessions

```bash
tmux list-sessions
```

### View Session Without Attaching

```bash
# Capture current pane content
tmux capture-pane -t codebuff-test -p

# Capture with ANSI colors preserved
tmux capture-pane -t codebuff-test -p -e
```

## Troubleshooting

### Input Not Appearing

1. **Forgot bracketed paste**: Always use `$'\e[200~text\e[201~'`
2. **CLI not ready**: Increase sleep time after starting the session
3. **Wrong session name**: Verify with `tmux list-sessions`

### Characters Garbled

1. **Not using `-l` flag in TypeScript**: Use `send-keys -l` for literal strings
2. **Shell escaping issues**: Use `$'...'` syntax in bash for escape sequences

### Session Cleanup Issues

Always use `2>/dev/null` when killing sessions to suppress errors if already closed:

```bash
tmux kill-session -t "$SESSION" 2>/dev/null || true
```

## Integration with Bun Tests

The `.bin/bun` wrapper automatically detects tmux requirements for files matching:
- `*integration*.test.ts`
- `*e2e*.test.ts`

Name your test files accordingly to get automatic tmux availability checking.
