# Lessons: CLI tester efficiency and CLI knowledge improvements

## What went well

- The SDK-driven harness made it straightforward to collect full event streams, stream chunks, structured outputs, and tmux capture paths for repeated `codebuff-local-cli` runs.
- The baseline runs clearly exposed behavior patterns instead of relying on intuition.
- The Codebuff CLI itself was capable and informative during implementation-oriented runs; most inefficiency came from the tester agent’s workflow rather than the CLI under test.

## What was tricky

- The `codebuff-local-cli` agent uses only `run_terminal_command`, `add_message`, and `set_output`, so all tester intelligence has to come from prompt/instruction quality rather than richer tooling.
- Long Codebuff CLI responses live in a scrollable viewport. The tester spent many extra steps trying to recover hidden content even when the visible portion already contained enough evidence.
- One smoke run silently started a second tmux session mid-run, showing that the current guidance was too weak about preserving session continuity and treating failure recovery explicitly.
- Reading tmux capture artifacts from inside the tester run is ineffective because the agent does not have `read_files`; attempts to recover more evidence should therefore be avoided unless the current viewport is truly insufficient.

## Quantified before/after findings

### Smoke scenario

- Baseline smoke runs: `27` and `38` total events, with one run silently starting a replacement tmux session mid-run.
- Post-change smoke run: `27` total events, `10` tool calls, `3` captures, no replacement session, and clearer capture labels (`initial-state`, `after-help`, `after-2plus2`).

### Implementation scenario

- Baseline implementation runs:
  - tool calls: `19` and `21`
  - captures: `8` and `7`
  - total cost: `30` and `40`
  - strong evidence of wasted viewport-recovery actions (page up/down, history keys, extra captures, direct tmux scrollback commands)
- Post-change implementation run:
  - tool calls: `10`
  - captures: `4`
  - total cost: `14`
  - no viewport-recovery thrashing; the tester captured the ready state, in-progress state, response, and follow-up response and then stopped.

## Baseline findings

- Smoke runs were mostly efficient, but their capture labels were generic and the agent did not explicitly reason about why each capture was worth taking.
- One smoke run restarted the session instead of treating the original session as canonical, inflating event/tool counts.
- Implementation runs showed the biggest inefficiency: excessive viewport recovery actions (page up/down, arrow keys, extra captures, direct tmux scrollback commands) after the key recommendation was already visible.
- The tester lacked Codebuff-specific guidance about:
  - what the ready state looks like,
  - when `/help` is especially valuable,
  - how to structure a good implementation-oriented test,
  - and when to stop chasing perfect captures of long responses.

## What changed behavior most

- Adding a canonical-session instruction prevented silent session replacement behavior and made failure handling expectations explicit.
- Adding the shared “high-value capture” heuristic reduced redundant captures and discouraged overlapping progress snapshots.
- Adding explicit guidance to stop chasing hidden viewport text eliminated the biggest source of waste in implementation-oriented runs.
- Adding Codebuff-specific flow guidance improved follow-up quality and reduced exploratory key usage.

## Changes made from baseline evidence

- Added shared operating heuristics to bias CLI testers toward fewer, higher-value captures and away from unnecessary UI mutation.
- Added explicit guidance to avoid `read_files` on tmux artifacts from inside the tester run.
- Added Codebuff-specific testing guidance covering ready state, smoke-test flow, implementation-test flow, long-response behavior, and session continuity expectations.
- Added best-effort harness cleanup when a run throws after a tmux session has already been created.

## Cautionary note

- Different runs may disagree about whether adjacent edge cases are worth fixing. For example, one post-change implementation run argued that the original-case `isEnvFile` call path was acceptable because `.env` files are conventionally lowercase, while earlier baseline runs framed nearby case handling as security-sensitive. Future work should settle those questions with source-of-truth tests or project policy, not by trusting a single run’s opinion.

## Known limitation

- The analysis harness now does best-effort tmux cleanup when a run throws after a session has already been created, but it still does not implement a hard per-run abort/timeout with guaranteed teardown if `client.run()` stalls indefinitely. Future iterations should add explicit run cancellation once the preferred timeout mechanism is settled.

## What we intentionally did not change

- We did not change the tmux helper scripts because the baseline problems were primarily agent-behavior issues, not script failures.
- We did not broaden the tester’s tool access; this pass focuses on making the current workflow smarter rather than increasing power.
- We did not change the shared output schema because the existing `set_output` contract was sufficient for analysis once the agent behavior improved.
