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
