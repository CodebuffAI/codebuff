# str_replace cascading-corruption hardening — SPEC

## Problem
A pasted agent transcript showed `str_replace` corrupting a file across ~10 retries: the 0.80 adaptive near-match branch misfired into the wrong switch case, then repeated no-op/auto-correct edits drifted the file until `describeActivity` was duplicated and `ActivityRow` split. The agent eventually had to rewrite the whole file.

## Goals
- Eliminate the auto-correct misfire path that caused the corruption.
- Stop retry death-spirals per path.
- Make malformed-arg errors immediately actionable.
- Add defense-in-depth structural checks.
- Raise the bar for which oldStrings may auto-correct at all.

## Non-goals
- Cross-cutting refactors (e.g. `creditsUsed` rename).
- Changes to the strict 0.92 near-match path (already correct).
- `apply_patch` / `apply_smart_patch` fuzzy alignment (separate system).
- Prompt-level agent changes.

## Acceptance criteria
1. A 0.84-similarity oldString no longer auto-corrects; it produces a re-read error.
2. A near-match whose newString unbalances delimiters is rejected.
3. After 2 consecutive failures on a path, `str_replace` returns a circuit-breaker error directing to `rewrite_symbol` / `write_file`.
4. Malformed `atomic`/`basedOnRead`/`occurrenceIndex` args produce a shape-specific hint.
5. Auto-correct requires oldString length >= 30 (diagnostic path keeps 10).
6. `bun run --cwd=packages/agent-runtime typecheck` and focused tests pass.
