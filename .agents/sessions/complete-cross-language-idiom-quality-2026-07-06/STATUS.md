# STATUS: Complete cross-language idiom quality workstream

## Current state

Phase: planning complete; durable plan packet created; no implementation performed in this plan-mode turn.

Session: `.agents/sessions/complete-cross-language-idiom-quality-2026-07-06`

## Completed

- Reviewed prior implementation status from the working tree and previous inspection:
  - R1 is a 4-language MVP for TypeScript/JavaScript, Python, Rust, and Go.
  - R2 is mostly implemented with default-on inferred hooks and `autoFileChangeHooks: false` opt-out.
  - R4 blocker about missing non-TS queries appears stale because 13 `.scm` query files exist; parity work remains pending.
  - R6/Q1/Q2/Q3 are not complete beyond generic substrate.
- Created `SPEC.md` with goals, non-goals, requirements, acceptance criteria, relevant systems, and constraints.
- Created `PLAN.md` with milestones M0-M7, validation gates, dependencies, risks, checkpoint rules, and recommended order.

## Pending

- User review of the plan packet.
- Choose first execution slice. Recommended first slice: M1 plus a narrow part of M2.
- Before any execution, inspect current dirty-tree state and avoid reverting unrelated changes.

## Blocked / open decisions

- M1 supported-language scope: recommended to align with code-map query support: TypeScript/JavaScript, Python, Rust, Go, Java, C#, C/C++, Ruby, PHP, Swift, Kotlin.
- M2 hook behavior: decide whether `ruff check --fix .` should remain default or be changed to non-mutating `ruff check .` for validation hooks. Recommendation: prefer non-mutating validation unless explicitly choosing auto-fix behavior.
- M3 grammar availability: PHP/Swift/Kotlin WASM availability may vary, so tests need to distinguish graceful no-op from query regressions.
- M7 promotion policy: automatic promotion should remain disabled until idiom-rubric judge agreement and regression thresholds are proven.

## Next checkpoint

If the user says to proceed, start M1:
1. Re-read `common/src/util/language-profiles.ts`, `common/src/util/__tests__/language-profiles.test.ts`, `agents/idioms/`, template placeholder tests, and docs.
2. Expand supported language profiles and idiom files for the chosen v1 set.
3. Run targeted prompt/language-profile validation and configured hooks.
4. Update this STATUS.md with progress and validation results.

## Resume instructions

- Read `SPEC.md`, `PLAN.md`, `STATUS.md`, and `LESSONS.md` in this session directory.
- Use `update_plan_status` for incremental status/lesson updates during execution.
- Use `create_plan` only if SPEC/PLAN scope changes materially or a missing artifact must be recreated.
- Preserve unrelated dirty-tree changes; do not revert user work.

<!-- update_plan_status:appended -->
## M1 completed — 2026-07-06T17:45:48.853Z

Current state: M1 language-profile expansion is implemented and validated.

Completed:
- Added language profiles and idiom pointers for Java, C#/.NET, C/C++, Ruby, PHP, Swift, and Kotlin on top of the existing TypeScript/JavaScript, Python, Rust, and Go support.
- Added compact idiom files for all newly supported languages.
- Expanded tests for extension detection, manifest detection, stable ordering/deduplication, compact prompt rendering, and unrelated-language omission.
- Updated shared prompt-section documentation.

Validation:
- `bun test common/src/util/__tests__/language-profiles.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts agents/__tests__/quality-prompt-snapshot.test.ts` passed.
- Configured hooks passed: `cd common && bun run typecheck`; `cd packages/agent-runtime && bun run typecheck`.

Pending:
- M2 auto-wired linter hook hardening and deterministic lint classification.
- M4/Q1 traceability gate, M3/R4 tree-sitter parity, M5/R6 idiom evals, M6/Q2 structural/retrieval improvements, M7/Q3 self-improvement loop.

Next checkpoint: start M2. Inspect `sdk/src/tools/file-change-hooks.ts`, `sdk/src/__tests__/file-change-hooks.test.ts`, `sdk/src/provider-config.ts`, `evals/buffbench/deterministic-signals.ts`, and deterministic-signal tests before editing.

<!-- update_plan_status:appended -->
## Status update — 2026-07-06T17:51:34.286Z

Phase: M2 complete; awaiting next implementation slice.

Completed in latest slice:
- M1 language-profile expansion remains completed from prior slice.
- M2 hook hardening/classification/docs completed.
- Validation passed:
  - `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts` — pass, 15 tests.
  - `bun test evals/buffbench/__tests__/deterministic-signals.test.ts` — pass after fixing `gofmt` shell-command classification precedence.
  - `run_file_change_hooks` for M1+M2 changed files — pass: `typecheck-common`, `typecheck-sdk`.

Pending:
- M4 idiom-read traceability gate is the next recommended milestone.
- M3/M5/M6/M7 remain pending after M4.

Next checkpoint:
1. Inspect `evals/buffbench/plan-sharding-signals.ts` and related tests for the pure-signal pattern.
2. Add `evals/buffbench/idiom-traceability-signals.ts` and tests.
3. Validate with targeted buffbench tests and configured hooks.


<!-- update_plan_status:appended -->
## Status update — 2026-07-06T17:58:20.028Z

Phase: M4 traceability gate partially complete; source module/tests validated.

Completed in latest slice:
- Added `evals/buffbench/idiom-traceability-signals.ts` with pure trace analysis for supported non-TypeScript edits.
- Added `evals/buffbench/__tests__/idiom-traceability-signals.test.ts` covering pass/fail/skip, multi-language edits, repeated edits, TypeScript exemption, `read_files` path/range/symbol detection, and `edit_transaction` extraction.
- M4.1 through M4.5 marked done in `PLAN.md`.

Validation passed:
- `bun test evals/buffbench/__tests__/idiom-traceability-signals.test.ts` — pass, 10 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` for changed files — pass: `typecheck-common`, `typecheck-sdk`.

Pending:
- M4.6 integrate idiom traceability signals into buffbench reporting as advisory/eval gate, not runtime enforcement.
- After M4.6, move to M3 per recommended execution order unless priorities change.

Next checkpoint:
1. Inspect `evals/buffbench/run-buffbench.ts`, `evals/buffbench/format-output.ts`, `evals/buffbench/types.ts`, and runner trace shape.
2. Add advisory idiom-traceability evaluation to buffbench result/report plumbing.
3. Validate with targeted buffbench tests/typecheck and configured hooks.


<!-- update_plan_status:appended -->
## M4.6 validation — 2026-07-06T18:02:13.767Z

M4.6 validation completed successfully.

- `bun test evals/buffbench/__tests__/idiom-traceability-signals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` passed: 24 pass, 0 fail.
- `cd evals && bun run typecheck` passed.
- Configured file-change hooks passed for changed files: `cd common && bun run typecheck`, `cd sdk && bun run typecheck`.
- Buffbench reporting integration now carries `idiomTraceability` through eval run results, trace records, analysis JSON, and formatted per-agent output.


<!-- update_plan_status:appended -->
## M3 parity test validation — 2026-07-06T18:08:31.782Z

M3/R4 tree-sitter parity test slice completed.

Completed in this slice:
- Expanded `packages/code-map/__tests__/languages.test.ts` coverage so the language table and `WASM_FILES` manifest include PHP, Swift, and Kotlin alongside the previously documented languages.
- Added a language-table parity assertion that every configured language has a declared wasm file and non-empty query reference/content.
- Added representative `parseFileStructure` parity tests for JavaScript, Java, C#, C++, and Ruby definitions.
- Added explicit structural graceful-no-op coverage for registered languages whose WASM grammars are unavailable in `@vscode/tree-sitter-wasm`: PHP, Swift, and Kotlin.

Validation passed:
- `cd packages/code-map && bun test src/__tests__/structure.test.ts __tests__/languages.test.ts __tests__/languages-m7.test.ts` — pass.
- `cd packages/code-map && bun run typecheck` — pass.
- `run_file_change_hooks` for changed code-map files — skipped because no configured hook matched `packages/code-map/**`.

Pending:
- M3.4 query improvements are not needed for this slice because all available bundled grammars covered by the new fixtures pass.
- Broader downstream consumer verification for M3.5 can be covered in M6 rewrite/structural-read work unless a dedicated M3 follow-up is requested.


<!-- update_plan_status:appended -->
## M5 initial rubric plumbing validation — 2026-07-06T18:14:38.746Z

M5 initial idiom rubric schema/plumbing is implemented and validated.

Completed in this slice:
- Added optional `idiomScore` and `nonIdiomaticPatternsDetected` fields to `JudgingResultSchema` and the judge agent output schema.
- Updated the judge prompt to include optional Idiom Compliance scoring for non-TypeScript language tasks.
- Averaged `idiomScore` only across judges that emit it, preserving compatibility with old/partial judge outputs.
- Carried `averageIdiomScore` through `AgentEvalResults` and printed idiom scores in task summaries and score distributions.
- Printed non-idiomatic patterns in formatted per-agent results.
- Added compatibility/reporting tests for optional idiom rubric fields.

Validation passed:
- `bun test evals/buffbench/__tests__/run-buffbench.test.ts evals/buffbench/__tests__/idiom-traceability-signals.test.ts` — pass, 26 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` for M5 changed eval files — skipped; no configured hook matched these files.

Pending M5 work:
- M5.2 Python idiom tasks.
- M5.3 Rust idiom tasks.
- M5.4 Go idiom tasks.
- M5.6 deterministic pattern helpers for obvious non-idioms where safe.
- Further dry-run/fixture eval coverage once tasks exist.


<!-- update_plan_status:appended -->
## M5 idiom task slice started — 2026-07-06T18:17:28.461Z

Starting M5.2-M5.6 slice. Existing M5.1 rubric plumbing is already present in `judge.ts`, `types.ts`, `run-buffbench.ts`, `format-output.ts`, and `run-buffbench.test.ts`. This slice will add initial Python/Rust/Go idiom eval tasks plus pure deterministic non-idiom pattern helpers/tests, without changing runtime scoring enforcement.


<!-- update_plan_status:appended -->
## M5 idiom task slice validation — 2026-07-06T19:06:15.728Z

M5 idiom eval task slice completed and validated.

Completed in this slice:
- Added the initial `evals/buffbench/eval-idioms-v1.json` seed eval with Python, Rust, and Go idiom tasks.
- Added conservative deterministic idiom pattern helpers in `evals/buffbench/idiom-pattern-signals.ts` plus unit coverage.
- Confirmed existing M5 rubric/reporting plumbing carries optional `idiomScore`, `nonIdiomaticPatternsDetected`, average idiom scores, and formatted output.

Validation passed:
- `bun test evals/buffbench/__tests__/idiom-pattern-signals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` — pass, 22 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` for M5 eval files — skipped because no configured hook matched `evals/buffbench/**`.

Pending:
- Reviewer gate for the M5 source changes.
- Future M5 hardening can add fixture-only/dry-run eval execution once a stable local seed repository is available.

Next checkpoint: run reviewer gate for the M5 eval source changes, then move to M6 structural/retrieval improvements if review is green.


<!-- update_plan_status:appended -->
## M5 reviewer resolution — 2026-07-06T19:13:49.172Z

Reviewer blocker for M5 deterministic idiom pattern wiring is resolved.

Follow-up fixes:
- Wired `detectIdiomPatternSignals(agentResult.diff)` into the `runTask` path in `evals/buffbench/run-buffbench.ts`.
- Added `mergeIdiomPatternFindings` so deterministic findings are merged into `JudgingResult.nonIdiomaticPatternsDetected`, preserving existing judge-provided findings.
- Added run-path coverage in `evals/buffbench/__tests__/run-buffbench.test.ts` that stubs a Python non-idiom diff, executes `runTask`, and verifies `python-manual-open-close` is present in the returned eval run, commit trace, and persisted trace JSON.

Validation after blocker resolution:
- `bun test evals/buffbench/__tests__/idiom-pattern-signals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` — pass, 24 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` for M5 eval files — skipped because no configured hook matched `evals/buffbench/**`.
- Code reviewer returned `LOOKS_GOOD` after the run-path coverage fix.

Current state: M5 initial Python/Rust/Go idiom eval tasks, deterministic idiom pattern helpers, rubric/reporting plumbing, and run-path coverage are complete for this slice.

Next checkpoint: proceed to M6 structural/retrieval improvements, starting with rewrite-symbol and structural-read tests for Python/Rust/Go and parser-supported JVM/.NET languages.


<!-- update_plan_status:appended -->
## M6 rewrite-symbol validation — 2026-07-06T19:26:03.380Z

M6 structural rewrite-symbol test slice started and validated.

Completed in this slice:
- Added cross-language `rewrite_symbol` handler coverage in `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts` for Python functions/class methods, Rust functions/impl methods, Go functions/receiver methods, and parser-supported Java/C# methods.
- Added a shared test helper that captures the delegated `str_replace` patch so tests assert the exact symbol range is rewritten and sibling definitions/types are not touched.
- This slice covers M6.1 and provides M6.2 evidence: the parser-supported languages in scope pass through current structural range handling; no implementation gap was proven in `rewrite_symbol` for these fixtures.

Validation passed:
- `bun test packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts` — pass, 14 tests across the target file plus mirrored eval fixture copy.
- `cd packages/agent-runtime && bun run typecheck` — pass.
- `run_file_change_hooks` for `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts` — pass: `typecheck-agent-runtime`.

Pending:
- Reviewer gate for this M6 source-test change.
- Remaining M6 tasks: structural-read companion coverage if needed, repo-map prototype/comparison, and retrieval-ranking evals.


<!-- update_plan_status:appended -->
## M6 reviewer gate — 2026-07-06T19:27:17.965Z

Reviewer gate passed for the M6 rewrite-symbol structural test slice.

Reviewer result:
- `LOOKS_GOOD`: coverage covered; tests exercise parser-supported file extensions and assert sibling symbols are not removed.

Current state:
- M6.1 initial parser-supported rewrite-symbol coverage is complete for Python, Rust, Go, Java, and C#.
- M6.2 initial evidence indicates no rewrite-symbol range-handling implementation gap for these fixtures.

Next checkpoint:
- Continue M6 with structural-read companion coverage or start the repo-map/retrieval comparison slice (M6.4-M6.6), keeping any repo-map prototype behind an eval/prototype flag and out of the default prompt path.


<!-- update_plan_status:appended -->
## M6 structural-read companion validation — 2026-07-06T19:37:55.517Z

M6 structural-read companion coverage added for parser-backed non-TS symbols in `packages/agent-runtime/src/__tests__/structural-read.test.ts`. Targeted validation passed: `bun test packages/agent-runtime/src/__tests__/structural-read.test.ts` (27 pass) and `cd packages/agent-runtime && bun run typecheck`. Configured hook passed: `typecheck-agent-runtime`. Reviewer gate pending for this slice.


<!-- update_plan_status:appended -->
## M6 structural-read reviewer result — 2026-07-06T19:38:43.697Z

Reviewer gate completed for M6 structural-read companion coverage. Result: `LOOKS_GOOD` — coverage is covered, public handler/shared extractor paths are exercised, and no blocking correctness, reliability, or maintainability issues were found. M6 structural-read companion slice is complete; next checkpoint remains the repo-map/retrieval comparison slice if continuing M6.


<!-- update_plan_status:appended -->
## M6 repo-map/retrieval comparison status — 2026-07-06T19:47:47.105Z

M6 repo-map/retrieval comparison slice implemented.

Completed:
- Added `packages/indexer/src/repo-map.ts` as a prototype deterministic repo-map renderer/query helper for retrieval eval comparison.
- Exported repo-map helpers/types from `packages/indexer/src/index.ts`.
- Added non-TS retrieval comparison coverage in `packages/indexer/src/query-quality.test.ts` for Python, Rust, and Go fixture files.

Validation:
- `bun test packages/indexer/src/query-quality.test.ts` passed.
- `cd packages/indexer && bun run typecheck` passed.
- Configured hook `typecheck-indexer` passed.

Next checkpoint: reviewer gate for the repo-map/retrieval comparison slice.


<!-- update_plan_status:appended -->
## M6 repo-map reviewer fix — 2026-07-06T19:49:24.939Z

Reviewer found an inconsistent fixture after the first M6 repo-map review: `benchmarkIndex.fileCount` remained `7` while the fixture now contains 10 files. Fixed `packages/indexer/src/query-quality.test.ts` to set `fileCount: 10`.

Revalidation after fix:
- `bun test packages/indexer/src/query-quality.test.ts` passed.
- `cd packages/indexer && bun run typecheck` passed.
- Configured hook `typecheck-indexer` passed.

Next checkpoint: rerun reviewer gate after the fixture consistency fix.


<!-- update_plan_status:appended -->
## M6 repo-map reviewer green — 2026-07-06T19:50:06.913Z

M6 repo-map/retrieval comparison slice is reviewer-green after the fixture-count fix.

Final validation:
- `bun test packages/indexer/src/query-quality.test.ts` passed.
- `cd packages/indexer && bun run typecheck` passed.
- Configured hook `typecheck-indexer` passed.

Reviewer gate:
- `LOOKS_GOOD`: fixture count is consistent, comparison helpers are exported without changing production `queryIndex` behavior, and tests cover non-TS repo-map retrieval plus deterministic report rendering.

Next checkpoint: proceed to the next incomplete durable-plan item after M6, or consolidate/commit validated workstreams if requested.


<!-- update_plan_status:appended -->
## M6 repo-map final gates green — 2026-07-06T19:53:31.801Z

M6 repo-map/retrieval comparison slice remains green after test-writer and doc-writer gates.

Additional coverage/docs completed:
- `packages/indexer/src/query-quality.test.ts` now imports repo-map helpers through `./index`, covering the public export surface.
- Added empty-index coverage for `buildRepoMap`, `queryRepoMap`, and `compareRetrievalStrategies`.
- Added boundary coverage for `maxFiles: 0` and blank repo-map queries.
- `docs/agents-and-tools.md` documents the repo-map comparison helper contract, options, minimal usage, and gotchas.

Validation:
- `cd packages/indexer && bun run typecheck && bun test` passed: 69 tests, 0 failed.
- Configured hook `typecheck-indexer` passed.

Reviewer gate:
- `LOOKS_GOOD`: helpers remain comparison-only, exports are covered through the public entrypoint, edge cases are tested, and docs accurately describe the API/gotchas.


<!-- update_plan_status:appended -->
## M6.6 retrieval-ranking validation — 2026-07-06T20:02:20.209Z

M6.6 retrieval-ranking coverage is implemented and validated.

Completed:
- Added same-language idiom guidance ranking coverage in `packages/indexer/src/query-quality.test.ts` for Python, Rust, and Go idiom docs.
- Expanded the benchmark fixture with `agents/idioms/python.md`, `agents/idioms/rust.md`, and `agents/idioms/go.md`, keeping `fileCount` consistent.
- The new test asserts `queryIndex` with `fileTypes: ['md']` ranks the matching language idiom file first before non-TS edits.

Validation:
- `bun test packages/indexer/src/query-quality.test.ts` passed.
- `cd packages/indexer && bun run typecheck` passed.
- Configured hook `typecheck-indexer` passed.

Next checkpoint: implement M7 dry-run/manual-review self-improvement plumbing around extracted proposals, before/after comparison, and promotion policy.


<!-- update_plan_status:appended -->
## M7 validation before reviewer — 2026-07-06T20:25:36.246Z

Phase: M7 self-improvement proposal plumbing slice validated; reviewer gate pending.

Completed in latest slice:
- Lessons extraction now passes idiom judge context into the lessons prompt: `idiomScore` plus `nonIdiomaticPatternsDetected` are included in the judge summary provided to `buffbench-lessons-extractor`.
- `runTask` proposal dry-run coverage now asserts the lessons extractor receives the idiom judge context before emitting review-only proposals.
- Existing M7 proposal plumbing remains in place: extracted proposals are parsed, applied in dry-run mode only, persisted into eval run/trace/analysis data, and included in saved lesson reports.
- Promotion policy/report helpers remain covered by proposal tests.

Validation passed:
- `bun test evals/buffbench/__tests__/proposals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` — pass.
- `cd evals && bun run typecheck` — pass.
- Configured hook `typecheck-indexer` passed for pending gate files.

Pending:
- Reviewer gate for the M7 source/test changes.

Next checkpoint: run reviewer gate over `evals/buffbench/lessons-extractor.ts`, `evals/buffbench/run-buffbench.ts`, `evals/buffbench/types.ts`, `evals/buffbench/trace-analyzer.ts`, `evals/buffbench/proposals.ts`, `evals/buffbench/__tests__/run-buffbench.test.ts`, `evals/buffbench/__tests__/proposals.test.ts`, and `packages/indexer/src/query-quality.test.ts`.


<!-- update_plan_status:appended -->
## M7 reviewer green — 2026-07-06T20:28:09.288Z

M7 self-improvement proposal plumbing is reviewer-green for the current dry-run/manual-review slice.

Completed in this slice:
- `evals/buffbench/lessons-extractor.ts` now includes `idiomScore` and `nonIdiomaticPatternsDetected` in the judge context passed to the lessons extractor.
- Extracted proposals continue to be parsed, simulated against copied local agent definitions, and persisted only as review artifacts (`proposalDryRun`) in eval runs, traces, analysis data, and saved lesson reports.
- `evals/buffbench/proposals.ts` now documents and enforces dry-run-only semantics for `applyProposals`: summaries always use `[dry-run]`, the compatibility `dryRun` flag no longer enables `[apply]`, and the helper never signals automatic persistence.
- Proposal promotion policy/report helpers remain manual-review gates around before/after comparisons rather than automatic production mutations.
- Tests cover proposal parsing/application, dry-run-only behavior, promotion threshold/rejection behavior, runTask proposal storage, and the lessons prompt receiving idiom judge context.

Validation passed after reviewer fix:
- `bun test evals/buffbench/__tests__/proposals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` — pass.
- `cd evals && bun run typecheck` — pass.
- Configured hook `typecheck-indexer` passed for pending gate files.

Reviewer gate:
- First review found a blocking concern that `applyProposals({ dryRun: false })` exposed `[apply]` mode.
- Fixed by making `applyProposals` always dry-run/manual-review only and adding test coverage.
- Re-review result: `LOOKS_GOOD: coverage: covered.`

Current state: M7 dry-run/manual-review self-improvement loop slice is complete and validated. Remaining work, if continuing the durable plan beyond this slice, is consolidation/commit or any separately requested hardening/e2e live buffbench run.


<!-- update_plan_status:appended -->
## UIMessage prompt fix validation — 2026-07-06T21:46:30.156Z

Validation completed for the UIMessage-to-ModelMessage prompt fix.

Completed:
- Updated `common/src/util/messages.ts` so `convertCbToModelMessages` detects persisted UIMessage-shaped entries by authoritative `parts` and converts them with AI SDK `convertToModelMessages` before cache-control and model schema validation.
- Preserved Codebuff auxiliary metadata, including falsy-but-defined values such as `sentAt: 0` and `keepDuringTruncation: false`.
- Added regression coverage in `common/src/util/__tests__/messages.test.ts` for UIMessage-shaped persisted entries, including mixed `parts` plus stale `content`.

Validation passed:
- `bun test common/src/util/__tests__/messages.test.ts agents/__tests__/quality-prompt-snapshot.test.ts evals/buffbench/__tests__/plan-sharding-signals.test.ts`
- `cd common && bun run typecheck`

Reviewer follow-up:
- Addressed metadata preservation and mixed `parts`/`content` UIMessage detection findings from manual review.


<!-- update_plan_status:appended -->
## UIMessage prompt fix validation rerun — 2026-07-06T21:51:07.775Z

Validation rerun completed for the UIMessage-to-ModelMessage prompt fix after context compaction.

Validated commands:
- `bun --cwd common test src/util/__tests__/messages.test.ts` — pass.
- `cd common && bun run typecheck` — pass.

Notes:
- Initial `bun --cwd common run typecheck` invocation printed Bun usage instead of running the package script; reran from `common/` with `bun run typecheck` successfully.
- Configured file-change hooks had previously skipped because no hook matched the changed files, so targeted validation is the current validation record for `common/src/util/messages.ts` and `common/src/util/__tests__/messages.test.ts`.

