# @codebuff/cli

A Terminal User Interface (TUI) package built with OpenTUI and React.

## Installation

```bash
bun install
```

## Development

Run the TUI in development mode:

```bash
bun run dev
```

## Testing

Run the test suite:

```bash
bun test
```

### Interactive E2E Testing

For testing interactive CLI features, install tmux:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows (via WSL)
wsl --install
sudo apt-get install tmux
```

Then run the proof-of-concept:

```bash
bun run test:tmux-poc
```

See [src/__tests__/README.md](src/__tests__/README.md) for comprehensive testing documentation.

## Build

Build the package:

```bash
bun run build
```

## Run

Run the built TUI:

```bash
bun run start
```

Or use the binary directly:

```bash
codebuff-tui
```

## Features

- Built with OpenTUI for modern terminal interfaces
- Uses React for declarative component-based UI
- TypeScript support out of the box

## Theme Detection

The CLI auto‑detects light/dark mode using multiple sources with a clear precedence:

- Preferred: Terminal OSC 10/11 polling (background/foreground color)
  - Polled every 5s
  - Works in native terminals that answer OSC (Terminal.app, iTerm2, WezTerm, kitty, Alacritty, Ghostty)
  - Supports tmux/screen via passthrough wrapping
- Fallback: IDE theme (when running in an integrated terminal)
  - VS Code family (Code/Cursor/VSCodium) via settings.json and env
  - JetBrains (IntelliJ family) via laf.xml and env
  - Zed via its settings and explicit env vars (e.g., `ZED_TERM`)
- Last resort: OS/platform theme
  - macOS via `defaults read -g AppleInterfaceStyle`
  - Windows registry and common Linux desktop settings

Live updates

- Terminal OSC polling updates the theme automatically when the terminal changes its colors.
- File watchers are enabled for IDE settings and macOS preference files, so theme changes propagate even when OSC is unavailable.
- When both are available, OSC results take precedence over IDE/OS.

Manual refresh

- Send `SIGUSR2` to the process to force a theme recomputation.
