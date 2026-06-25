# P1.14 — patterns/ directory + INDEX.md — LESSONS

## Durable notes

### Patterns library design (P1.14, mex-borrowing)
- Surface only the **INDEX** (`agents/patterns/INDEX.md`) in the system prompt, not individual pattern files. This keeps token cost constant regardless of how many patterns exist. Agents `read_files` the specific pattern on demand.
- Patterns are **agent-agnostic** — rendered to all agents via a shared placeholder. Task-type routing (P2 follow-up) would require a task discriminator the runtime doesn't have yet.
- The INDEX format is a markdown pipe-table: `| pattern | file | description |`. The loader reuses the same table-parsing approach as `router.ts`.
- Drift coverage: extend `checkIndexSync` to include `agents/patterns/INDEX.md` so broken links in the index are caught by the existing drift suite — no new checker needed.

### Implementation order
1. Create the patterns library files first (so the loader + prompt have real content to render).
2. Then the loader + tests.
3. Then wire the placeholder into `strings.ts` and the base2 template.
4. Finally extend drift-guard + its tests.

_(Append additional lessons as they are discovered during execution.)_

<!-- update_plan_status:appended -->
## Wrap-up — P1.14 shipped — 2026-06-23

### What shipped
- `agents/patterns/INDEX.md` + 5 curated pattern guides (add-a-new-tool, ship-a-cli-command, extend-the-sdk, add-an-agent, run-targeted-tests). INDEX is a 3-column pipe table; guides are standalone markdown read on demand by the agent.
- `common/src/util/patterns.ts` — `parsePatternsIndex` / `loadPatternsIndex` / `formatPatternsIndexSection`. Mirrors `router.ts` parse→load→format pattern.
- `common/src/util/__tests__/patterns.test.ts` — 13 tests (parsing, loading, formatting, edge cases including multi-table stop, missing columns, CRLF).
- System-prompt wiring: `PATTERNS_INDEX` placeholder added to PLACEHOLDER enum (`templates/types.ts`), provider added to `strings.ts`, `${PLACEHOLDER.PATTERNS_INDEX}` injected into `agents/base2/base2.ts` near the knowledge-files section.
- Drift-guard extension: `agents/patterns/INDEX.md` added to `checkIndexSync` `indexFiles` list in `scripts/memory-drift-guard.ts` + regression test in `scripts/__tests__/memory-drift-guard.test.ts`.

### Validation gate (Milestone 6)
- common + agent-runtime + scripts typechecks: all exit 0.
- 86 targeted tests pass / 0 fail (patterns 13/13, router 16/16, plan-artifacts, memory-drift-guard, byok-wording-guard).
- Memory-drift guard exits 1 with ONLY `.bun-install/install/cache/` broken-link noise (third-party package READMEs) — documented P1.15 follow-up (add `.bun-install` to `SKIP_DIRECTORIES`). No patterns-surface drift.
- Holistic reviewer: LOOKS_GOOD.

### Reusable patterns / gotchas
- **Token efficiency**: surface only the INDEX in the system prompt (constant cost); agents `read_files` individual patterns on demand. This scales to N patterns without growing the prompt.
- **Table-parsing reuse**: `parsePatternsIndex` uses the same approach as `parseRouterTable` (pipe-table rows, header detection, skip prose). The parser must **stop after the first table ends** (don't restart on a second table header) — caught by a test and fixed by adding a `tableEnded` guard.
- **Drift coverage for new index files**: extend `checkIndexSync`'s `indexFiles` array — no new checker needed. The existing checker validates that referenced files exist.
- **`.bun-install` noise**: the broken-link checker flags third-party READMEs inside `.bun-install/install/cache/`. P1.15 will add `.bun-install` to `SKIP_DIRECTORIES` to suppress this noise.
- **Placeholder wiring is a 3-file change**: enum (`types.ts`) → provider (`strings.ts`) → injection site (`base2.ts`). All three must land together or the prompt render fails with an unresolved placeholder.

### Follow-ups
- P1.15: add `.bun-install` to `SKIP_DIRECTORIES` in `scripts/memory-drift-guard.ts` and wire the guard into CI (tool-config-sync).
- P2 (future): task-type routing for patterns (requires a task discriminator the runtime doesn't have yet).
