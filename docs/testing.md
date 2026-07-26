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

## Confirming a suspected flake

CI retries a failing test job up to three times (`nick-fields/retry` in
`ci.yml`), so a test that fails once and passes on retry leaves almost no
trace. When a suite fails on a busy machine and passes on a quiet one, the
temptation is to call it the machine's fault. Don't: **load is not a cause, it
is a magnifier.** What it magnifies are real defects that a single run on an
idle laptop cannot show.

`scripts/flake-hunt.ts` reproduces those conditions deliberately — N rounds,
each running the suite several times *simultaneously* while CPU busy-loops
compete for the cores — and names every test that fails.

```bash
# The default hunt: 3 rounds x 2 overlapping runs of the desktop suite.
bun scripts/flake-hunt.ts

# Harder, and on a different package.
bun scripts/flake-hunt.ts --dir cli --rounds 5 --concurrency 3 --hogs 8

# Interrogate one suspect file: cheap enough to run 10 times.
bun scripts/flake-hunt.ts --cmd "bun test src/app/server.test.ts" --rounds 10
```

It exits non-zero if any run reported a failing test, prints the load average
per round, and writes each run's full output to a log it names for you. If your
shell lacks the repo env (a worktree without direnv), pass it through the
command: `--cmd "bun --env-file=../.env.local test"`.

**Three things to check before blaming the machine.** Each of these was a real
defect found by this harness on its first outing:

1. **Shared state between concurrent runs.** `server.test.ts` spawned its
   orchestrator on a hardcoded port *and probed that port for readiness*, so two
   overlapping runs did not collide — they merged. The loser's server died with
   `EADDRINUSE`, its readiness probe was answered by the winner's server, and
   its tests then drove a foreign engine with a different `$HOME` and a
   different open project. Two concurrent runs of that one file produced 6 and
   19 failures scattered across unrelated assertions; alone it passes 49/49.
   Spawn servers on port 0 and read back the port they actually got.

2. **Waits that sample instead of listening.** A fixed count of 10ms polls is a
   budget with no relationship to how long the work takes, and it pays a full
   tick even when the work already finished. Await the signal the system already
   emits (the engine's event bus, a process's own stdout), with a wall-clock
   deadline that names what it was waiting for.

3. **Timers and promises that outlive their test.** A 200ms debounced save in
   the renderer store fired *inside a later test* that had swapped in its own
   `fetch`, landing a stray request in that test's recorded calls. Which test
   becomes the victim is decided by timing, so a loaded machine changes the
   answer. Cancel pending background work between cases.

A fourth pattern worth naming: a test that races two real timers against each
other (a 20ms cadence against a 40ms window) has a 2x margin that starvation
erases. Inject the clock and advance it explicitly rather than sleeping.

Prefer these fixes over longer timeouts. A longer timeout makes the symptom
rarer without making the test deterministic, and it slows every honest run to
buy that. The one legitimate use is converting an *iteration count* into a
wall-clock deadline, since only the latter means "this is broken" rather than
"this machine is slow".

Two caveats when reading the results. A clean hunt is evidence, not proof —
absence of failure across six runs bounds the flake rate, it does not disprove
it. And a test of the form "sleep 20ms, then assert nothing has happened yet"
can only pass *vacuously* under load, so this harness will never flag it; those
need rewriting to assert ordering rather than absence.

The weekly `flake-hunt.yml` workflow runs this against `freebuff-desktop` and
reports failures without blocking any PR.
