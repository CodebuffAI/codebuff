# Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@codebuff/common/testing/mock-modules.ts` helpers for constants only.

CLI hook testing note: React 19 + Bun + RTL `renderHook()` is unreliable; prefer integration tests via components for hook behavior.

## Test env must come from a fixture, not the developer's `.env`

`@codebuff/common`'s `env.ts` validates the `NEXT_PUBLIC_*` vars at **import** time and throws, and Bun loads `.env` files from the process cwd — so a package-local `bun test` sees none of the repo-root env even when the root run is green. A whole test file then dies with `Invalid environment configuration` before a single test runs, which bun reports as an unhandled error rather than a failure, so the suite silently stops covering that file.

Every package must therefore have a `bunfig.toml` preloading `sdk/test/setup-env.ts` — the one shared fixture, which supplies placeholder values for every var the schemas require. This is not just a local-dev nicety: CI runs `cd <package> && bun test`, i.e. exactly the package-local mode. Placeholders only — tests must never need real credentials, so `bun test` means the same thing in a fresh worktree and in a provisioned checkout.

The same rule covers generated inputs. `cli/src/agents/bundled-agents.generated.ts` is gitignored, and importing it at module scope wiped 17 files (~371 tests) in a fresh worktree; `cli/test/setup-agents-artifact.ts` now builds it on demand instead of relying on everyone knowing to run `bun run prebuild:agents`.

Tests that need a **service** rather than a variable should skip cleanly and say why, but never in CI. `@codebuff/internal/testing/test-db` probes Postgres once, skips the DB suites locally with the docker command to fix it, and throws when `CODEBUFF_GITHUB_ACTIONS=true` — otherwise a broken CI service container would read as a pass. Gate on **reachability**, never on `!process.env.DATABASE_URL`: the fixtures supply a placeholder URL, so presence stopped meaning availability.

Tests that spawn a server child should race readiness against `proc.exited` and report the child's captured output (see `freebuff-desktop/src/app/server.test.ts`). Polling a dead port surfaces only as "a hook timed out", which names neither the cause nor the process that failed.

### The CI guard against disappearing tests

CI does not run `bun test` directly — it goes through `scripts/ci/test-with-guard.ts`, which fails the build on any of:

1. any error outside a test body — an `Unhandled error between tests` marker (a file that crashed at import) or a non-zero `N errors` in bun's summary,
2. a test or file count **below** the baseline in `.github/test-baselines.json`, including the degenerate case where the caller's glob selects **no files at all** (a renamed directory would otherwise print "no tests found" and pass).

Growth never fails the build, so adding tests needs no baseline change; the guard just notes the baseline is stale. Deleting tests on purpose means re-recording: re-run the job's command with `--update`.

**A skipped suite and a running suite do not report the same total.** Skipped tests are counted, so it is tempting to assume a baseline recorded locally transfers to CI — it does not when a whole `describe` is skipped. Measured on the billing DB suites: each skipped file reported exactly **two more** than it did when it ran (47 vs 41 across three files), and the guard duly failed a healthy CI run. So a baseline for a suite that skips locally but runs in CI — anything DB-backed — must be taken from a real CI run. Read the observed counts out of the job log and write them into `.github/test-baselines.json`.

Re-record in a CI-equivalent state, which means running `cd sdk && bun run build` first. A few cli tests register a placeholder test *only when* `sdk/dist` is missing, so a baseline seeded without it is inflated and the guard then fails a perfectly healthy CI run. (The guard caught exactly this while being built.)

This exists because every check bun gives you is blind to the failure mode that actually happened here three times: a file stops contributing tests and the summary still reads as mostly-green.

**`[test].exclude` in `bunfig.toml` does nothing on bun 1.3.14.** Verified by pointing it at an ordinary test file, which still ran. That is why the repo-root `exclude` does not keep `*.integration.test.*` out of a root run, and why CI filters them with `find ... ! -name '*.integration.test.ts'`. Gate on a runtime condition instead of trusting the key.

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
