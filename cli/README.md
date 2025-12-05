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

### E2E Testing

E2E tests use a terminal emulator to test interactive CLI features. Build the SDK first:

```bash
cd ../sdk && bun run build
cd ../cli && bun test e2e/
```

See [src/**tests**/README.md](src/__tests__/README.md) for testing documentation.

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
