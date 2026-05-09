# Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@codebuff/common/testing/mock-modules.ts` helpers for constants only.

CLI hook testing note: React 19 + Bun + RTL `renderHook()` is unreliable; prefer integration tests via components for hook behavior.

## CLI tmux Testing

For testing CLI behavior via tmux, use the helper scripts in `scripts/tmux/`. These handle bracketed paste mode and session logging automatically. Session data is saved to `debug/tmux-sessions/` in YAML format and can be viewed with `bun scripts/tmux/tmux-viewer/index.tsx`. See `scripts/tmux/README.md` for details.

Useful workflow for agents:

```bash
# Start the dev CLI in a detached tmux session.
SESSION=$(./scripts/tmux/tmux-cli.sh start --name cli-check -w 160 -h 40 --wait 6)

# Capture the initial screen. Captures are written to debug/tmux-sessions/$SESSION/.
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label initial

# Send a prompt. The helper uses bracketed paste so text is not dropped.
./scripts/tmux/tmux-cli.sh send "$SESSION" "Search for getAgentBaseName and report what you find" --wait-idle 4

# Capture after the run, then inspect the saved capture text.
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label after-search --wait 2

# Clean up when finished.
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

If a change can be verified with a small local harness instead of a live model-backed CLI run, run that harness inside tmux too. This still checks terminal rendering and produces a capture:

```bash
SESSION=$(./scripts/tmux/tmux-cli.sh start \
  --name render-check \
  -w 160 -h 20 \
  --wait 1 \
  --command "bun .context/my-render-check.tsx")

./scripts/tmux/tmux-cli.sh capture "$SESSION" --label rendered
./scripts/tmux/tmux-cli.sh stop "$SESSION"
```

When verifying UI output, prefer checking the saved capture file for concrete strings that should and should not appear. For example, after expanding a code-searcher agent, check that the capture shows the search summary but not raw structured payload keys like `results:` or `stdout:`.
