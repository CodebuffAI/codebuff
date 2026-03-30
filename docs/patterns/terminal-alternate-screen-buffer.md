# Terminal Alternate Screen Buffer Pattern

When building CLI applications with full-screen UIs (like TUI apps), use the alternate screen buffer to prevent UI output from polluting the user's terminal scrollback when the app exits.

## The Problem

By default, terminal applications write to the main screen buffer. When a full-screen CLI app exits, all its UI output remains in the terminal scrollback, cluttering the user's terminal history. This is annoying for users who expect clean terminal behavior like vim, less, htop, and other well-behaved CLI tools.

## The Solution: Alternate Screen Buffer

Terminals support an alternate screen buffer that can be entered/exited using ANSI escape sequences:

- **Enter alternate screen:** `\x1b[?1049h` (smcup)
- **Exit alternate screen:** `\x1b[?1049l` (rmcup)

When you enter the alternate screen buffer, the terminal saves the current screen content. When you exit, it restores the original content, leaving the scrollback clean.

## Implementation Pattern

### 1. Define the Escape Sequences

```typescript
// Terminal alternate screen buffer escape sequences
export const ENTER_ALT_BUFFER = '\x1b[?1049h'
export const EXIT_ALT_BUFFER = '\x1b[?1049l'
```

### 2. Enter Before Rendering

Enter the alternate screen buffer BEFORE initializing your UI renderer:

```typescript
export function enterAlternateScreen(): void {
  if (process.stdout.isTTY) {
    process.stdout.write(ENTER_ALT_BUFFER)
  }
}

async function main(): Promise<void> {
  // Enter alternate screen buffer BEFORE rendering the app
  if (process.stdout.isTTY) {
    enterAlternateScreen()
  }

  // Initialize your UI renderer after entering alternate buffer
  const renderer = await createCliRenderer({ ... })
  // ... rest of app initialization
}
```

### 3. Exit During Cleanup

Ensure the alternate screen buffer is exited during all cleanup scenarios:

```typescript
const TERMINAL_RESET_SEQUENCES =
  EXIT_ALT_BUFFER + // Exit alternate screen buffer (restores main screen)
  '\x1b[?1000l' + // Disable X10 mouse mode
  '\x1b[?1002l' + // Disable button event mouse mode
  // ... other terminal reset sequences
  '\x1b[?25h' // Show cursor

function resetTerminalState(): void {
  try {
    process.stdout.write(TERMINAL_RESET_SEQUENCES)
  } catch {
    // Ignore errors - stdout may already be closed
  }
}
```

### 4. Handle All Exit Scenarios

Register cleanup handlers for all possible exit scenarios:

```typescript
process.on('SIGTERM', cleanup)
process.on('SIGHUP', cleanup)
process.on('SIGINT', cleanup)
process.on('beforeExit', cleanup)
process.on('exit', cleanup)
process.on('uncaughtException', cleanup)
process.on('unhandledRejection', cleanup)
```

## Key Considerations

### TTY Detection

Only enter alternate screen buffer in interactive terminals:

```typescript
if (process.stdout.isTTY) {
  enterAlternateScreen()
}
```

This prevents issues when:
- Output is piped to a file (`app > output.txt`)
- Running in CI/automated environments
- Output is redirected or captured

### Timing is Critical

1. **Enter alternate buffer FIRST** - before any UI initialization
2. **Exit alternate buffer LAST** - as part of terminal reset sequences
3. **Write exit sequence directly to stdout** - don't rely on UI renderer cleanup

### Terminal Compatibility

The `?1049` sequence is widely supported by modern terminals:
- xterm, gnome-terminal, iTerm2, Terminal.app
- tmux, screen (with proper configuration)
- Windows Terminal, ConEmu

Very old terminals may not support it, but the TTY check provides a reasonable fallback.

## Integration with UI Frameworks

### OpenTUI Example

```typescript
import { createCliRenderer } from '@opentui/core'

async function main(): Promise<void> {
  // Enter alternate screen BEFORE creating renderer
  if (process.stdout.isTTY) {
    enterAlternateScreen()
  }

  const renderer = await createCliRenderer({
    backgroundColor: 'transparent',
    exitOnCtrlC: false,
  })
  
  // Install cleanup handlers that exit alternate screen
  installProcessCleanupHandlers(renderer)
  
  // Render your app
  createRoot(renderer).render(<App />)
}
```

### Ink.js Example

```typescript
import { render } from 'ink'

function main() {
  if (process.stdout.isTTY) {
    enterAlternateScreen()
  }

  const { unmount } = render(<App />)
  
  // Ensure cleanup on exit
  process.on('exit', () => {
    unmount()
    resetTerminalState()
  })
}
```

## Testing

To verify alternate screen buffer works correctly:

1. **Before running your CLI:** Note some text in your terminal scrollback
2. **Run your CLI:** The UI should appear in a clean screen
3. **Exit your CLI:** You should return to the exact terminal state from step 1
4. **Check scrollback:** The UI output should not appear in your scrollback history

## Common Mistakes

❌ **Entering alternate buffer too late** - after UI initialization
❌ **Not checking TTY status** - breaks piped output
❌ **Forgetting exit sequences** - leaves terminal in alternate buffer
❌ **Not handling all exit scenarios** - cleanup only works for normal exit
❌ **Relying on UI framework cleanup** - may not run if framework crashes

## When to Use

Use alternate screen buffer for:
- Full-screen TUI applications
- Interactive CLI tools with complex UIs
- Any CLI that renders multiple lines of output that users don't need to reference later

Don't use for:
- Simple command-line tools with minimal output
- Tools where users need to reference output after exit
- Log viewers or tools that should integrate with terminal scrollback