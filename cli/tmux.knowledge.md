# tmux CLI testing notes

The CLI's interactive tests use [tmux](https://github.com/tmux/tmux) so they
can run the TUI in a real terminal session and capture the rendered pane.

## Install tmux

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows
wsl --install
sudo apt-get install tmux
```

## Run the proof of concept

From the `cli/` directory:

```bash
bun run test:tmux-poc
```

The proof of concept creates a detached session, starts the CLI with
`--help`, captures the pane, checks the help output, and removes the session
when it finishes.

## Send input correctly

OpenTUI expects pasted text to be wrapped in bracketed-paste markers. A plain
`send-keys` call can drop characters, so use `-l` and the markers around the
text:

```bash
tmux send-keys -t SESSION -l $'\e[200~hello world\e[201~'
```

The same pattern in TypeScript is:

```ts
await tmux([
  'send-keys',
  '-t',
  sessionName,
  '-l',
  `\x1b[200~${text}\x1b[201~`,
])
```

Press Enter separately when the test needs to submit the input.

## Useful tmux commands

```bash
# Start a detached session with a fixed pane size
tmux new-session -d -s cli-test -x 120 -y 30

# Capture the current pane as plain text
tmux capture-pane -t cli-test -p

# Inspect active sessions
tmux list-sessions

# Always clean up a test session
tmux kill-session -t cli-test
```

Use a unique session name in automated tests so a stale session from an
earlier run cannot affect the current one. The integration tests also clean up
their sessions in `finally` blocks.

## Run the integration tests

From the `cli/` directory, build the SDK first and then run the tmux suite:

```bash
bun run --cwd ../sdk build
bun test src/__tests__/integration-tmux.test.ts
```

The suite skips itself when tmux or the built SDK is unavailable. When a tmux
server is already running, the tests copy the CLI test environment into its
global environment before starting a session.

## Troubleshooting

- Capture output with `tmux capture-pane -t SESSION -p` before attaching; this
  keeps the test output reproducible and easy to assert on.
- If a test is interrupted, run `tmux list-sessions` and remove its stale
  session with `tmux kill-session -t SESSION`.
- Keep the pane at least 120 columns wide and 30 rows high, matching the
  proof-of-concept defaults, so help and status output do not wrap differently.
