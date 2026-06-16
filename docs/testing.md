# Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@codebuff/common/testing/mock-modules.ts` helpers for constants only.

## Running per-package scripts with bun

`bun --cwd <pkg> run <script>` does NOT execute the script — it silently prints
the script list of the root package and exits 0, which makes it dangerously
easy to think typecheck/test passed when nothing ran. Use one of these instead:

- `cd <pkg> && bun run <script>` (recommended for ad-hoc / scripted basher use)
- `bun --filter=@codebuff/<pkg> run <script>` (workspace-aware)
- `bun --filter='*' run <script>` (every workspace)

This applies to `typecheck`, `test`, `build`, etc.

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

## Diagnosing long test output

For broad test suites or failures with long output, preserve the complete log first and extract a focused failure view second. Do not rely only on the terminal tool's truncated summary or on `tail`, which can hide the first failing assertion.

```bash
cd packages/agent-runtime
set -o pipefail
bun test 2>&1 | tee /tmp/openbuff-agent-runtime-test.log >/dev/null
status=${PIPESTATUS[0]}
grep -n -E "\\(fail\\)|error:|Expected|Received|panic|Unhandled" /tmp/openbuff-agent-runtime-test.log | head -120
exit "$status"
```

Then inspect the saved log around the reported line numbers with `sed -n '<start>,<end>p' /tmp/openbuff-agent-runtime-test.log`. This keeps the real exit status while making failures diagnosable even when command output is truncated.

## Rebuilt CLI and context telemetry smoke tests

After rebuilding the packaged CLI with `cd cli && bun run build:binary`, run a direct binary smoke test before assuming the new bundle is active:

```bash
cd cli
./bin/openbuff --version
./bin/openbuff --help | sed -n '1,40p'
```

For a live model-backed smoke test from the repository root, use a short non-mutating prompt and capture the terminal output:

```bash
cli/bin/openbuff --agent base2 "Say READY and stop."
```

Expected output includes the Openbuff banner, the prompt text, and `READY`. The CLI may still run read-only checks such as `git_status` before answering.

To exercise message-trimming context telemetry without a live model, run a small Bun harness that imports `trimMessagesToFitTokenLimit`, creates an over-limit synthetic history with user/assistant messages, todos, file reads, subagent output, and terminal output, and passes a logger that records `debug()` calls. The debug payload should include `contextCategoryTelemetry.before` and `.after` with category token/message counts.
