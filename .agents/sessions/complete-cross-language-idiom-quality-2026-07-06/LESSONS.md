# LESSONS: Complete cross-language idiom quality workstream

## Planning lessons

- The earlier R4 blocker is likely resolved at the inventory level: `packages/code-map/src/tree-sitter-queries/` now has 13 `.scm` files and `packages/code-map/src/languages.ts` imports/registers non-TS queries. The remaining work is quality/parity testing, not file discovery.
- R1 should not be redesigned. The existing pattern is correct: compact language-profile prompt plus explicit `read_files agents/idioms/<lang>.md` instruction before non-trivial edits.
- R2 already has the important product decision: default-on inferred hooks with `autoFileChangeHooks: false` opt-out. Remaining work is safety, docs, deterministic signal classification, and possibly non-mutating hook defaults.
- The Q1 traceability gate should copy the shape of `evaluateMinimumShardRule`: pure, deterministic, unit-tested, advisory/eval-first, with human-readable reasons.
- Q3 is automation over existing substrate (`lessons-extractor`, `proposals`, `compare-runs`), but it must wait for R6 idiom evals; otherwise there is no trustworthy signal to optimize.

## Gotchas

- The working tree is already dirty with many unrelated/ongoing changes. Any execution must preserve those changes and avoid broad cleanup/revert operations.
- Missing external linters are expected in many user projects. Inferred hooks need clear diagnostics and bounded retries rather than assuming tool availability.
- Auto-fixing hooks such as `ruff check --fix .` may mutate files during validation. Decide intentionally whether default hooks should be non-mutating.
- PHP/Swift/Kotlin grammar availability may vary from query-file presence; tests should allow graceful missing-grammar behavior while still testing query quality when grammar is available.
- Idiom judging is subjective; use deterministic pattern checks where safe and calibrate judge agreement before trusting auto-promotion.

## Decisions recorded

- Recommended v1 language expansion should align with code-map query support before adding languages that lack structural support.
- Recommended execution order: M1 -> M2 -> M4 -> M3 -> M5 -> M6 -> M7.
- Recommended first execution slice: finish M1 and a narrow deterministic-signal part of M2.
- Auto-promotion in Q3 should begin as dry-run/manual-review only.

## Follow-up notes

- If M1 scope expands beyond code-map-supported languages, update SPEC and PLAN first because acceptance criteria and tests will change.
- If M2 changes hook commands from mutating to non-mutating, document it as a product behavior decision.
- If M3 reveals major query gaps, split query work by language family rather than editing every `.scm` file in one execution slice.
- If M6 repo-map prototype wins in evals, create a separate implementation plan before enabling it in default prompt/retrieval paths.

<!-- update_plan_status:appended -->
## M2 classification precedence gotcha — 2026-07-06T17:51:49.220Z

M2 gotcha: command classification must check lint-specific commands before broad test detection. The inferred Go formatting hook is `test -z "$(gofmt -l .)"`; because it starts with shell `test`, test-first classification miscategorized it as `test`. Lint classification now precedes test classification while compile/build still remains highest priority.

<!-- update_plan_status:appended -->
## M4 traceability design note — 2026-07-06T17:58:35.271Z

M4 traceability design decision: keep the rule pure and advisory. It checks tool-call order only (`read_files` before first supported non-TypeScript edit), not file content quality or runtime enforcement. TypeScript/JavaScript edits are exempt because current idiom profile guidance treats TS as the baseline and Q1 specifically targets non-TS edits.


<!-- update_plan_status:appended -->
## M5 lessons — 2026-07-06T19:06:27.127Z

M5 idiom seed tasks are currently fixture/schema validated rather than executed against a real cloned seed repository. Keep future dry-run validation separate from the pure unit/typecheck gate until `codebuff/idiom-seed-fixtures` is stable and available.

The `code-searcher` helper does not accept `-n` and expects directory scoping via `cwd`, not positional paths in `flags`; use `cwd: "evals/buffbench"` and only supported `-g` flags for future scoped searches.


<!-- update_plan_status:appended -->
## M6 structural slice lesson — 2026-07-06T19:26:17.408Z

M6 rewrite-symbol fixtures are a useful first slice because they exercise the downstream consumer path (`handleRewriteSymbol` -> structural ranges -> delegated `str_replace`) rather than only `parseFileStructure`. For Python/Rust/Go/Java/C#, current parser-supported structural ranges were sufficient, so do not change query/range implementation without a failing fixture. Future M6 work should focus separately on repo-map/retrieval comparison data before enabling any retrieval changes by default.


<!-- update_plan_status:appended -->
## M6 structural-read testing lesson — 2026-07-06T19:38:06.027Z

For structural-read companion coverage, keep non-TS fixtures small and assert parser-backed line spans through the public handlers (`handleReadOutline`, `handleReadSlices`) plus shared `extractSlices`. This catches outline rendering, slice kind/range extraction, and capability token minting without changing runtime code.


<!-- update_plan_status:appended -->
## M6 repo-map comparison lesson — 2026-07-06T19:48:04.260Z

Repo-map comparison is intentionally eval/prototype-only for now: keep it exported for benchmark/reporting callers, but do not wire it into default `query_index` ranking. The slice should compare against existing query_index behavior without changing production retrieval semantics.


<!-- update_plan_status:appended -->
## M7 dry-run-only decision — 2026-07-06T20:28:23.320Z

M7 dry-run/manual-review self-improvement loop decision: `applyProposals` must not expose an apply-mode signal in this phase. Keep it pure and always `[dry-run]`; any accepted proposal must be manually staged in a separate review step after before/after comparison. This prevents helper API drift from implying automatic production agent mutation before promotion gates are proven.

