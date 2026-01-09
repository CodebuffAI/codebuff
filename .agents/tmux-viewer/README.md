# tmux-viewer

Interactive TUI for viewing tmux session logs. Designed to work for **both humans and AIs**.

## Usage

```bash
# Interactive TUI (for humans)
bun .agents/tmux-viewer/index.tsx <session-name>

# JSON output (for AIs)
bun .agents/tmux-viewer/index.tsx <session-name> --json

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
- **Keyboard shortcuts**:
  - `↑↓` or `jk`: Navigate captures
  - `←→` or `hl`: Switch panels
  - `q` or Ctrl+C: Quit
  - Use the `--json` flag on the CLI entrypoint for JSON output

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

## Development

```bash
# Typecheck
cd .agents && bun run typecheck

# Run directly
bun .agents/tmux-viewer/index.tsx --list
```
