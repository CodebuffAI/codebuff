# tmux-viewer

Interactive TUI for viewing tmux session logs. Designed to work for **both humans and AIs**.

## Usage

```bash
# Interactive TUI (for humans)
bun .agents/tmux-viewer/index.tsx <session-name>

# Start in replay mode (auto-plays through captures like a video)
bun .agents/tmux-viewer/index.tsx <session-name> --replay

# JSON output (for AIs)
bun .agents/tmux-viewer/index.tsx <session-name> --json

# Export as animated GIF
bun .agents/tmux-viewer/index.tsx <session-name> --export-gif output.gif

# Export with custom frame delay (default: 1500ms)
bun .agents/tmux-viewer/index.tsx <session-name> --export-gif output.gif --frame-delay 2000

# Export with custom font size (default: 14px)
bun .agents/tmux-viewer/index.tsx <session-name> --export-gif output.gif --font-size 16

# List available sessions
bun .agents/tmux-viewer/index.tsx --list

# View most recent session (if no session specified)
bun .agents/tmux-viewer/index.tsx
```

Or using the npm script:

```bash
cd .agents && bun run view-session <session-name>
```

## Features

### For Humans (Interactive TUI)
- **Timeline panel**: Navigate through captures with ↑↓ arrows
- **Capture panel**: View terminal output at each point in time
- **Metadata display**: Session info, dimensions, command count
- **Replay mode**: Auto-play through captures like a video player
- **Keyboard shortcuts**:
  - `Space`: Play/pause replay
  - `+` / `-`: Adjust playback speed (faster/slower)
  - `r`: Restart from beginning
  - `↑↓` or `jk`: Navigate captures (pauses replay)
  - `←→` or `hl`: Switch panels
  - `q` or Ctrl+C: Quit
  - Use the `--json` flag on the CLI entrypoint for JSON output

### Replay Mode

Replay mode auto-advances through captures chronologically, like a video player:

```bash
# Start replay immediately
bun .agents/tmux-viewer/index.tsx my-session --replay

# Or press Space in the TUI to start/stop replay
```

**Playback controls:**
- `Space` - Toggle play/pause
- `+` or `=` - Speed up (shorter interval between captures)
- `-` or `_` - Slow down (longer interval between captures)
- `r` - Restart from the first capture
- Arrow keys - Manual navigation (automatically pauses replay)

**Available speeds:** 0.5s, 1.0s, 1.5s (default), 2.0s, 3.0s, 5.0s per capture

The footer shows the current position (e.g., `3/10`), playback speed (e.g., `@1.5s`), and play/pause status.

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

## Integration with cli-tmux-tester

The `@cli-tmux-tester` agent can use this viewer to inspect session data:

```typescript
// In cli-tmux-tester output
{
  captures: [
    { path: "debug/tmux-sessions/cli-test-123/capture-001-initial.txt", label: "initial" }
  ]
}

// Parent agent can view the session
// bun .agents/tmux-viewer/index.tsx cli-test-123 --json
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
bun .agents/tmux-viewer/index.tsx my-session --export-gif

# Specify output path
bun .agents/tmux-viewer/index.tsx my-session --export-gif demo.gif

# Fast playback (500ms per frame)
bun .agents/tmux-viewer/index.tsx my-session --export-gif fast.gif --frame-delay 500

# Larger text for readability
bun .agents/tmux-viewer/index.tsx my-session --export-gif large.gif --font-size 18
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
cd .agents && bun run typecheck

# Run directly
bun .agents/tmux-viewer/index.tsx --list
```
