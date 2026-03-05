---
name: meta
description: Broad project-level implementation and validation heuristics
---

# Meta

- When validating CLI changes, run a non-effectful command path first (for example `--help`) before any command that could trigger external side effects. (from .agents/sessions/03-03-0909-add-console-log)
- For tightly scoped edits, pair runtime smoke-checks with `git diff -- <file>` to verify no unintended spillover. (from .agents/sessions/03-03-0909-add-console-log)
- From monorepo root, run workspace scripts as `bun run --cwd <workspace> <script>`; if Bun prints global run help, re-check flag order/command shape. (from .agents/sessions/03-03-0909-add-console-log)
