# Memory drift cleanup — SPEC

## Goal
Clear all 104 pre-existing `guard:memory-drift` findings so the guard exits 0 and can be promoted from a non-blocking CI warning to a blocking CI gate in `.github/workflows/ci.yml`.

## Current state (baseline)
`bun --cwd=scripts run guard:memory-drift` → exit 1, 104 findings across 5 active checkers:
- **path (11)** — stale backtick-quoted repo-relative paths in docs/patterns
- **command (49)** — `bun run <script>` references against wrong package.json (cwd inference) + `--cwd`-after-`run` regex bug
- **script-coverage (36)** — top-level `scripts/*.ts` not mentioned in markdown or `scripts/package.json`
- **todo-fixme (7)** — TODO/FIXME markers in knowledge/markdown files
- **broken-link (1)** — broken relative markdown link in `docs/architecture.md`

## Approach per category

### path (11) — fix-source
Update stale references in:
- `agents/patterns/extend-the-sdk.md:34` (`sdk/src/__tests__/provider-options-metadata.test.ts` — verify actual path)
- `packages/agent-runtime/src/templates/README.md:142` (`agent-overrides.ts` — verify or remove)
- `docs/codebuff-to-openbuff-migration.md:202,203` (deleted CLI files — replace with current equivalents or remove)
- `docs/architecture.md:39,51,62` (`src/*.tsx` — these are conceptual examples; either create the files or rephrase to not use backtick-quoted paths)

### command (49) — improve-guard
Two bugs in `checkCommand`:
1. **Regex bug:** `COMMAND_REGEX = /bun(?:\s+--cwd=[^\s]+)?\s+run\s+([a-zA-Z0-9:_-]+)/g` only matches `--cwd` BEFORE `run`. When docs write `bun run --cwd=scripts guard:memory-drift`, the regex captures `--cwd` as the script name. Fix: allow `--cwd` before OR after `run`, and don't capture it.
2. **Cwd inference:** The checker always checks `root/package.json` when no `--cwd` flag is present. But commands in subdir READMEs (e.g. `cli/README.md`, `sdk/e2e/README.md`, `evals/README.md`) are meant to run from that subdirectory. Fix: infer cwd from (a) `cd <dir> &&` prefix on the same line, then (b) nearest `package.json` ancestor of the markdown file, falling back to root.

### script-coverage (36) — improve-guard
The `scripts/` directory legitimately contains many standalone utility scripts run directly via `bun scripts/foo.ts`. The checker is too aggressive. Fix: change the heuristic so a script is only flagged if it is NOT in `scripts/package.json` AND NOT in any markdown AND NOT imported/referenced by any other `.ts` file in the repo. This catches truly orphaned scripts while allowing standalone utilities. If this still leaves findings, add a `scripts/.coverage-allow` allowlist file (one basename per line) for known utility scripts.

### todo-fixme (7) — fix-source
Resolve or annotate each TODO/FIXME marker:
- `cli/knowledge.md:289,300,305`
- `docs/codebuff-to-openbuff-migration.md:103,249,293`
- `scripts/ft-file-selection/README.md:49`
Either resolve the TODO, or add `<!-- allow-todo -->` if it's a legitimate long-term note.

### broken-link (1) — fix-source
Fix `docs/architecture.md:161` broken link `./request-flow.md#reviewer--validation-gate-semantics` — verify the anchor exists in `docs/request-flow.md` and fix the anchor text, or remove the anchor.

## Acceptance criteria
1. `bun --cwd=scripts run guard:memory-drift` exits 0 (0 findings)
2. `bun --cwd=scripts run typecheck` exits 0
3. `bun test scripts/__tests__/memory-drift-guard.test.ts` passes
4. `.github/workflows/ci.yml` "Memory drift + config sync" step runs `guard:memory-drift` as a **blocking** gate (remove the `|| echo "::warning::..."` non-blocking wrapper)
5. Reviewer gate returns LOOKS_GOOD

## Non-goals
- Adding new checkers to the guard
- Documenting all 36 utility scripts individually (unless the import-reference heuristic leaves residual findings)
- Refactoring the guard's architecture
