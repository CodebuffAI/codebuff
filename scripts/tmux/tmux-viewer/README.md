# tmux-viewer

Interactive TUI for viewing tmux session logs. Designed to work for **both humans and AIs**.

## Usage

```bash
# Interactive TUI (for humans)
bun scripts/tmux/tmux-viewer/index.tsx <session-name>

# Start in replay mode (auto-plays through captures like a video)
bun scripts/tmux/tmux-viewer/index.tsx <session-name> --replay

# JSON output (for AIs)
bun scripts/tmux/tmux-viewer/index.tsx <session-name> --json

# Export as animated GIF
bun scripts/tmux/tmux-viewer/index.tsx <session-name> --export-gif output.gif

# Export with custom frame delay (default: 1500ms)
bun scripts/tmux/tmux-viewer/index.tsx <session-name> --export-gif output.gif --frame-delay 2000

# Export with custom font size (default: 14px)
bun scripts/tmux/tmux-viewer/index.tsx <session-name> --export-gif output.gif --font-size 16

# List available sessions
bun scripts/tmux/tmux-viewer/index.tsx --list

# View most recent session (if no session specified)
bun scripts/tmux/tmux-viewer/index.tsx
```

Or using the npm script:

```bash
cd scripts/tmux && bun run view-session <session-name>
```

## Layout

The TUI uses a vertical layout designed for clarity:

```
┌─────────────────────────────────────────────────────────────────┐
│ Session: my-session  120x30           5 cmds  10 captures       │  ← Header
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    ┌──────────────────┐                         │
│                    │ [terminal output │                         │  ← Capture
│                    │  centered in     │                         │     View
│                    │  muted border]   │                         │
│                    └──────────────────┘                         │
│                                                                 │
├─ ⏸ Paused ──────────────────────────────────────────────────────┤
│  ┌─○ [1] 12:00:00─┐ ┌─▶ [2] 12:00:05─┐ ┌─○ [3] 12:00:10─┐       │  ← Timeline
│  │ initial-state  │ │ after-command  │ │ final-state    │       │     Cards
│  │ $ codebuff...  │ │ $ /help        │ │ $ /quit        │       │
│  └────────────────┘ └────────────────┘ └────────────────┘       │
├─────────────────────────────────────────────────────────────────┤
│ ▶ 2/10 @1.5s   space: play/pause  +/-: speed  ←→: navigate      │  ← Footer
└─────────────────────────────────────────────────────────────────┘
```

- **Header**: Session name, dimensions, command/capture counts
- **Capture View**: Terminal output centered with a muted border showing exact capture dimensions
- **Timeline**: Horizontal card-style navigation at the bottom, selected card stays centered
- **Footer**: Playback status, position, speed, and keyboard shortcuts

## Features

### For Humans (Interactive TUI)
- **Capture view**: Terminal output centered with visible boundary
- **Timeline panel**: Card-style navigation at the bottom with label and triggering command
- **Auto-centering**: Selected timeline card stays centered in view
- **Metadata display**: Session info, dimensions, command count
- **Replay mode**: Auto-play through captures like a video player
- **Keyboard shortcuts**:
  - `←` / `→` or `h` / `l`: Navigate between captures
  - `Space`: Play/pause replay
  - `+` / `-`: Adjust playback speed (faster/slower)
  - `r`: Restart from beginning
  - `q` or Ctrl+C: Quit
  - Use the `--json` flag on the CLI entrypoint for JSON output

### Replay Mode

Replay mode auto-advances through captures chronologically, like a video player:

```bash
# Start replay immediately
bun scripts/tmux/tmux-viewer/index.tsx my-session --replay

# Or press Space in the TUI to start/stop replay
```

**Playback controls:**
- `Space` - Toggle play/pause
- `+` or `=` - Speed up (shorter interval between captures)
- `-` or `_` - Slow down (longer interval between captures)
- `r` - Restart from the first capture
- `←` / `→` - Navigate captures (automatically pauses replay)

**Available speeds:** 0.5s, 1.0s, 1.5s (default), 2.0s, 3.0s, 5.0s per capture

The timeline panel title shows `▶ Playing` or `⏸ Paused`, and the footer shows current position (e.g., `2/10`), playback speed (e.g., `@1.5s`), and controls.

### For AIs (JSON Output)
Use the `--json` flag to get structured output:

```json
{
  "session": {
    "session": "cli-test-1234567890",
    "started": "2025-01-01T12:00:00Z",
    "dimensions": { "width": 120, "height": 30 },
    "status": "active"
  },
  "commands": [
    { "timestamp": "...", "type": "text", "input": "/help", "auto_enter": true }
  ],
  "captures": [
    {
      "sequence": 1,
      "label": "initial-state",
      "timestamp": "...",
      "after_command": null,
      "dimensions": { "width": 120, "height": 30 },
      "path": "debug/tmux-sessions/.../capture-001-initial-state.txt",
      "content": "[terminal output]"
    }
  ],
  "timeline": [
    { "timestamp": "...", "type": "command", "data": {...} },
    { "timestamp": "...", "type": "capture", "data": {...} }
  ]
}
```

## Data Format

The viewer reads YAML-formatted session data from `debug/tmux-sessions/{session}/`:

- `session-info.yaml` - Session metadata
- `commands.yaml` - Array of commands sent
- `capture-*.txt` - Capture files with YAML front-matter

### Session Info (session-info.yaml)
```yaml
session: cli-test-1234567890
started: 2025-01-01T12:00:00Z
started_local: Wed Jan 1 12:00:00 PST 2025
dimensions:
  width: 120
  height: 30
status: active
```

### Commands (commands.yaml)
```yaml
- timestamp: 2025-01-01T12:00:05Z
  type: text
  input: "/help"
  auto_enter: true
```

### Capture Files (capture-001-label.txt)
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
[terminal content here]
```

## Integration with cli-tester

The `@cli-tester` agent can use this viewer to inspect session data:

```typescript
// In cli-tester output
{
  captures: [
    { path: "debug/tmux-sessions/cli-test-123/capture-001-initial.txt", label: "initial" }
  ]
}

// Parent agent can view the session
// bun scripts/tmux/tmux-viewer/index.tsx cli-test-123 --json
```

## GIF Export

The `--export-gif` flag renders the session replay as an animated GIF, perfect for:
- Sharing CLI demonstrations
- Embedding in documentation
- Bug reports and issue tracking
- Creating tutorials

### GIF Export Options

| Option | Description | Default |
|--------|-------------|--------|
| `--export-gif [path]` | Output file path | `<session>-<timestamp>.gif` |
| `--frame-delay <ms>` | Delay between frames in milliseconds | `1500` |
| `--font-size <px>` | Font size for terminal text | `14` |

### Examples

```bash
# Basic export (auto-names the file)
bun scripts/tmux/tmux-viewer/index.tsx my-session --export-gif

# Specify output path
bun scripts/tmux/tmux-viewer/index.tsx my-session --export-gif demo.gif

# Fast playback (500ms per frame)
bun scripts/tmux/tmux-viewer/index.tsx my-session --export-gif fast.gif --frame-delay 500

# Larger text for readability
bun scripts/tmux/tmux-viewer/index.tsx my-session --export-gif large.gif --font-size 18
```

### GIF Output

The exported GIF includes:
- Terminal content rendered as monospace text
- Frame labels showing capture sequence number and label
- Timestamps for each frame
- Dark terminal-style background
- Automatic sizing based on terminal dimensions

## Development

```bash
# Typecheck
cd scripts/tmux/tmux-viewer && bun x tsc --noEmit

# Run directly
bun scripts/tmux/tmux-viewer/index.tsx --list
```
