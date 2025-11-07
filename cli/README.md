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

The CLI auto-detects light/dark mode using multiple sources in order of priority:

1. **Terminal colors** (highest priority)
   - Detects via OSC 10/11 queries to terminal background/foreground colors
   - Updates within 5 seconds when terminal theme changes
   - Supports: Terminal.app, iTerm2, WezTerm, kitty, Alacritty, Ghostty
   - Works in tmux/screen via passthrough wrapping

2. **IDE theme** (when running in integrated terminal)
   - VS Code/Cursor/VSCodium: `settings.json` + `VSCODE_THEME_KIND` env var
   - JetBrains (IntelliJ, PyCharm, etc.): `laf.xml` + env vars
   - Zed: `settings.json` + `ZED_TERM` env var
   - Updates within ~250ms via file watchers

3. **OS/Platform theme** (fallback)
   - macOS: `defaults read -g AppleInterfaceStyle` + file watchers on `.GlobalPreferences.plist`, `com.apple.Terminal.plist`, `com.googlecode.iterm2.plist`
   - Windows: Registry keys for system theme
   - Linux: GTK theme, GNOME/KDE settings
   - Updates within ~250ms via file watchers (macOS)

4. **Default dark** (if all detection fails)

All detection methods run in parallel. Terminal colors take precedence when available

Manual refresh

- Send `SIGUSR2` to the process to force a theme recomputation.
