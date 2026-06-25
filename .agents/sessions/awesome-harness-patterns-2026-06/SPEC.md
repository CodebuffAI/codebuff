# P1.14 — patterns/ directory + INDEX.md

## Goal
Ship a curated `agents/patterns/` library with an `INDEX.md` catalog, wire the catalog into the agent runtime system prompt (token-efficient: render INDEX so the agent reads individual patterns on demand), and extend the memory-drift-guard `index-sync` checker to cover the new index file.

## Scope
- **In scope:** new `agents/patterns/` directory with `INDEX.md` + 5 curated pattern guides; new `common/src/util/patterns.ts` loader; new `{CODEBUFF_PATTERNS_INDEX}` placeholder wired into `strings.ts`; extend `scripts/memory-drift-guard.ts` `checkIndexSync` to include `agents/patterns/INDEX.md`; tests for loader + drift-guard coverage.
- **Out of scope:** task-type-based pattern routing (defer until we have a task discriminator); auto-surfacing patterns via `query_index` integration (P2 follow-up); `tool-config-sync` for patterns (covered by extended `index-sync`).

## Acceptance criteria
1. `agents/patterns/INDEX.md` exists with a markdown table mapping pattern name → file path → short description.
2. 5 curated pattern guides exist under `agents/patterns/` (e.g. `add-a-new-tool.md`, `ship-a-cli-command.md`, `extend-the-sdk.md`, `add-an-agent.md`, `run-targeted-tests.md`).
3. `common/src/util/patterns.ts` exports `loadPatternsIndex(projectRoot, logger?)` returning the parsed index.
4. `packages/agent-runtime/src/templates/types.ts` adds `PATTERNS_INDEX` to placeholder names.
5. `packages/agent-runtime/src/templates/strings.ts` renders the patterns index via the new placeholder.
6. The base2 system prompt template includes `{CODEBUFF_PATTERNS_INDEX}` so it's surfaced to agents.
7. `scripts/memory-drift-guard.ts` `checkIndexSync` includes `agents/patterns/INDEX.md` in its index-files list.
8. Tests: `common/src/util/__tests__/patterns.test.ts` (loader parsing); drift-guard test for patterns index coverage.
9. `bun --cwd=common run typecheck`, `bun --cwd=packages/agent-runtime run typecheck`, `bun --cwd=scripts run typecheck` all exit 0.
10. Targeted tests pass: patterns loader, drift-guard, strings template.

## Non-goals
- Don't replace existing knowledge.md files.
- Don't auto-load individual pattern files into the prompt (only the INDEX is rendered; agents use `read_files` on demand).
- Don't wire patterns into the ROUTER.md table (patterns are agent-agnostic, surfaced to all agents).
