---
name: meta
description: Broad project-level implementation and validation heuristics
---

# Meta

- When validating CLI changes, run a non-effectful command path first (for example `--help`) before any command that could trigger external side effects. (from .agents/sessions/03-03-0909-add-console-log)
- For tightly scoped edits, pair runtime smoke-checks with `git diff -- <file>` to verify no unintended spillover. (from .agents/sessions/03-03-0909-add-console-log)
- From monorepo root, run workspace scripts as `bun run --cwd <workspace> <script>`; if Bun prints global run help, re-check flag order/command shape. (from .agents/sessions/03-03-0909-add-console-log)
- For SDK-driven agent evaluation, persist both structured run artifacts and raw tmux capture paths so you can compare event-level behavior against what the CLI actually displayed. (from .agents/sessions/03-06-0850-cli-tester-efficiency)
- For SDK-driven before/after comparisons, keep prompts, logging granularity, and timeout conditions fixed; otherwise event-count, cost, and duration deltas are too noisy to trust. (from .agents/sessions/03-06-0850-cli-tester-efficiency)
