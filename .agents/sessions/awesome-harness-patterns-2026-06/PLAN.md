# P1.14 — patterns/ directory + INDEX.md — PLAN

## Milestones

1. **Bootstrap session** — SPEC/PLAN/STATUS/LESSONS created.
2. **Create patterns library** — `agents/patterns/INDEX.md` + 5 curated pattern guides.
3. **Patterns loader** — `common/src/util/patterns.ts` with `loadPatternsIndex` + tests.
4. **System prompt wiring** — new `PATTERNS_INDEX` placeholder + `strings.ts` render + base2 template inclusion.
5. **Drift-guard extension** — `checkIndexSync` includes `agents/patterns/INDEX.md` + test.
6. **Validation gate** — typechecks + targeted tests + reviewer.
7. **Finalize artifacts** — STATUS/LESSONS + parent review pointer.

## File-by-file changes

### `agents/patterns/INDEX.md` (new)
Markdown table: `| pattern | file | description |` with 5 rows.

### `agents/patterns/*.md` (new, 5 files)
- `add-a-new-tool.md` — how to add a tool to the agent runtime.
- `ship-a-cli-command.md` — how to add a CLI slash command.
- `extend-the-sdk.md` — how to extend the SDK provider layer.
- `add-an-agent.md` — how to add a new agent template.
- `run-targeted-tests.md` — how to run focused typechecks/tests per package.

### `common/src/util/patterns.ts` (new)
- `PatternsIndex` type: `Array<{ name: string; file: string; description: string }>`.
- `parsePatternsIndex(markdown: string): PatternsIndex` — parse the INDEX.md table.
- `loadPatternsIndex(projectRoot: string, logger?: Logger): PatternsIndex` — read `agents/patterns/INDEX.md`, return `[]` on missing/error.
- `formatPatternsIndexPrompt(opts: { index: PatternsIndex }): string` — render a compact prompt section.

### `common/src/util/__tests__/patterns.test.ts` (new)
- Test parse with valid/empty/malformed tables.
- Test load with missing dir (returns `[]`).
- Test format renders compact section.

### `packages/agent-runtime/src/templates/types.ts` (edit)
- Add `'PATTERNS_INDEX'` to `placeholderNames`.

### `packages/agent-runtime/src/templates/strings.ts` (edit)
- Import `loadPatternsIndex`, `formatPatternsIndexPrompt`.
- Add `[PLACEHOLDER.PATTERNS_INDEX]` provider that loads from `fileContext.projectRoot`.

### `packages/agent-runtime/src/main-prompt.ts` or base2 template (edit)
- Insert `{CODEBUFF_PATTERNS_INDEX}` into the base2 system prompt near the knowledge files section.

### `scripts/memory-drift-guard.ts` (edit)
- `checkIndexSync`: add `'agents/patterns/INDEX.md'` to `indexFiles`.

### `scripts/__tests__/memory-drift-guard.test.ts` (edit)
- Add test: index-sync flags a missing file referenced by `agents/patterns/INDEX.md`.

## Validation gate
- `bun --cwd=common run typecheck`
- `bun --cwd=packages/agent-runtime run typecheck`
- `bun --cwd=scripts run typecheck`
- `bun test common/src/util/__tests__/patterns.test.ts`
- `bun test scripts/__tests__/memory-drift-guard.test.ts`
- `bun test packages/agent-runtime/src/templates/__tests__/strings.test.ts`
- Holistic code-reviewer on the full diff.

## Risks
- **R1:** Base2 template insertion point — must find the right spot in the prompt string. Mitigation: read `main-prompt.ts` / `prompts.ts` to find the knowledge-files section and place patterns adjacent.
- **R2:** Drift-guard `index-sync` regex must match patterns index table format. Mitigation: reuse the existing link/quoted-path regexes already in `checkIndexSync`.
- **R3:** Patterns loader must be resilient to missing dir (agent runtime may run before patterns exist). Mitigation: return `[]` on missing.
