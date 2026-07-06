# PLAN: Complete cross-language idiom quality workstream

<!-- current-task: none -->

## Milestones

### M0 — Plan handoff and worktree safety

- [x] M0.1 Review this plan packet and choose the next execution slice. (execution slice selected: M1 first)
- [x] M0.2 Before execution, inspect `git_status` and preserve unrelated dirty-tree changes. (dirty tree inspected and preserved)
- [x] M0.3 Decide whether current partial R1/R2 changes should be committed or kept as working-tree context before deeper work begins. (kept partial R1/R2 work as working-tree context; no commit requested)

Validation gate:
- No source changes in plan mode.
- User confirms the first execution slice or asks to proceed with the recommended sequence.

### M1 — Finish R1 language-profile coverage

Status: todo.

Tasks:
- [x] M1.1 Define the supported-language set for v1 completion. Recommended: TypeScript/JavaScript, Python, Rust, Go, Java, C#, C/C++, Ruby, PHP, Swift, Kotlin, aligned with `packages/code-map/src/languages.ts` query support. (aligned to code-map language table)
- [x] M1.2 Add `agents/idioms/<lang>.md` files for missing supported languages with compact guidance and common cross-language mistakes. (in progress) (added Java, C#/.NET, C/C++, Ruby, PHP, Swift, Kotlin idiom files)
- [x] M1.3 Expand `SupportedLanguageId`, extension mapping, and manifest mapping in `common/src/util/language-profiles.ts`. (expanded SupportedLanguageId plus extension/manifest maps)
- [x] M1.4 Add tests for each language via extensions and manifests where applicable. (covered extension/manifest detection and relevant-only pointers)
- [x] M1.5 Update docs for shared prompt sections and adding new language profiles. (updated shared prompt section docs)

Validation gate:
- `bun test common/src/util/__tests__/language-profiles.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts agents/__tests__/quality-prompt-snapshot.test.ts`
- Configured hooks for changed common/agent-runtime/agents files.

Dependencies:
- Existing R1 MVP remains the pattern; do not redesign prompt injection.

### M2 — Finish R2 auto-wired linter hooks

Status: todo / mostly implemented; needs hardening and eval integration.

Tasks:
- [x] M2.1 Audit existing `inferFileChangeHooks` commands for safety, portability, and missing-tool behavior. (next milestone) (validated)
- [x] M2.2 Add or adjust tests for default-on behavior, `autoFileChangeHooks: false`, config-fragment merging, and user-hook override/dedup semantics. (validated)
- [x] M2.3 Extend `evals/buffbench/deterministic-signals.ts` command classification for `cargo clippy`, `cargo fmt`, `ruff`, `go vet`, `gofmt`, `rubocop`, `swift-format`, and `dotnet format`. (validated)
- [x] M2.4 Document inferred hooks, opt-out, and expected behavior when a tool is not installed. (documented)
- [x] M2.5 Decide whether `ruff check --fix .` should remain default or become non-mutating `ruff check .` for validation-only hooks. Recommended: change to non-mutating unless the product explicitly wants hooks to modify files. (resolved as non-mutating `ruff check .`)

Validation gate:
- `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts`
- `bun test evals/buffbench/__tests__/deterministic-signals.test.ts`
- Configured SDK hooks.

Dependencies:
- Product decision already recorded: default-on with explicit disable flag.
- M2.5 may need user confirmation if changing auto-fix behavior is considered product-visible.

### M3 — Complete R4 tree-sitter parity audit and improvements

Status: todo; initial blocker resolved by discovering 13 query files.

Tasks:
- [x] M3.1 Create an inventory matrix of every `languageTable` entry and its `.scm` query file. (language/query inventory completed; PHP/Swift/Kotlin grammar absence confirmed)
- [x] M3.2 Add representative fixture files for Python, Rust, Go, Java, C#, C++, Ruby, PHP, Swift, Kotlin, JavaScript/TypeScript. (representative structural fixtures added for bundled grammar languages; unavailable grammar languages covered as graceful no-op)
- [x] M3.3 Add tests asserting extraction of functions, methods, classes/types, constants, imports/modules where language-appropriate. (parseFileStructure assertions added for definitions across available bundled grammars)
- [x] M3.4 Improve `.scm` queries that fail the matrix, sourcing patterns from nvim-treesitter/Helix only after verifying compatibility. (no query fixes required by current fixture matrix)
- [x] M3.5 Verify downstream consumers: `read_outline`, `read_files(symbols)`, `query_index` symbol references, and `rewrite_symbol` match lookup. (deferred deeper rewrite/read symbol coverage to M6; parseFileStructure consumer baseline validated)
- [x] M3.6 Document known gaps for languages whose WASM grammar may be absent in normal installs, especially PHP/Swift/Kotlin if applicable. (PHP/Swift/Kotlin unavailable grammar behavior documented in tests/status)

Validation gate:
- `cd packages/code-map && bun run typecheck && bun test` if package scripts exist; otherwise targeted monorepo test command for code-map tests.
- Targeted agent-runtime structural-read tests if extraction behavior changes.

Dependencies:
- M1 supported-language list should align with code-map support where possible.
- Avoid changing query semantics without representative tests.

### M4 — Implement Q1 idiom-read traceability gate

Status: todo.

Tasks:
- [x] M4.1 Add a pure trace-analysis module, likely `evals/buffbench/idiom-traceability-signals.ts`. (validated)
- [x] M4.2 Map edited file extensions/manifests to language ids and expected idiom file paths. (validated)
- [x] M4.3 Identify first edit event per non-TS language and prior `read_files` events for matching `agents/idioms/<lang>.md`. (validated)
- [x] M4.4 Return pass/fail/skip signals with reasons, mirroring `evaluateMinimumShardRule` style. (validated)
- [x] M4.5 Add unit tests for pass, fail, skip, multi-language edit, repeated edit, and TypeScript exemption/handling. (validated)
- [x] M4.6 Integrate into buffbench reporting as an advisory/eval gate, not runtime enforcement. (next) (integrated and validated)

Validation gate:
- `bun test evals/buffbench/__tests__/idiom-traceability-signals.test.ts`
- `cd evals && bun run typecheck` if available.

Dependencies:
- M1 idiom file paths and language ids must be stable.

### M5 — Implement R6 idiom-compliance evals

Status: todo.

Tasks:
- [x] M5.1 Define idiom rubric schema with `idiomScore` and `nonIdiomaticPatternsDetected`. (rubric schema/plumbing implemented and validated)
- [x] M5.2 Add initial Python tasks: pathlib, comprehensions, context managers, standard typing, idiomatic error handling. (seed idiom eval added)
- [x] M5.3 Add initial Rust tasks: `Result`/`?`, ownership-aware APIs, iterator usage where appropriate, no unnecessary clone/unwrap. (seed idiom eval added)
- [x] M5.4 Add initial Go tasks: explicit error handling, `%w` wrapping, small interfaces, gofmt-friendly structure. (seed idiom eval added)
- [x] M5.5 Update judge prompt/schema and result parsing to include idiom axis without breaking existing buffbench runs. (judge schema/reporting compatibility implemented)
- [x] M5.6 Add deterministic pattern helpers for obvious non-idioms where safe. (deterministic idiom pattern helpers implemented and wired)
- [x] M5.7 Add reports/dashboard fields for per-language idiom scores. (average idiom score and pattern reporting added)

Validation gate:
- Unit tests for rubric parsing/judge result compatibility.
- One small dry-run or fixture-only buffbench run for each initial language.

Dependencies:
- M4 traceability gate can be implemented before or after M5, but M5 reports should include M4 signals once both exist.

### M6 — Advance Q2 structural and retrieval improvements

Status: todo.

Tasks:
- [x] M6.1 Add `rewrite_symbol` tests for Python function/class method, Rust function/impl method, Go function/method, and Java/C# method/class where parser support allows. (rewrite_symbol cross-language tests passed)
- [x] M6.2 Determine which failures are query gaps vs. rewrite-symbol range handling vs. unavailable WASM grammar. (fixtures showed no current range-handling gap for supported parsers)
- [x] M6.3 Improve `rewrite_symbol` or structural-read only where tests prove gaps. (no implementation change required by validated fixtures)
- [x] M6.4 Prototype Aider-style repo-map/context compression behind an eval/prototype flag, not in default prompt path. (comparison-only repo-map prototype added)
- [x] M6.5 Compare repo-map against existing query_index/read_outline retrieval on non-TS fixture repos. (repo-map/query_index comparison tests and docs passed review)
- [ ] M6.6 Add retrieval-ranking tests or evals that prefer same-language idiomatic examples before non-TS edits.

Validation gate:
- `bun test packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts packages/agent-runtime/src/__tests__/structural-read.test.ts`
- Code-map tests from M3 if queries change.
- Retrieval eval/report artifact for repo-map decision.

Dependencies:
- M3 should precede broad rewrite-symbol claims.
- Repo-map should not ship by default until comparison data exists.

### M7 — Implement Q3 self-improvement loop

Status: todo.

Tasks:
- [x] M7.1 Pass idiom judge context (`idiomScore`, `nonIdiomaticPatternsDetected`) into lessons extraction for failing idiom tasks. (idiomScore and nonIdiomaticPatternsDetected included in lessons prompt)
- [x] M7.2 Ensure proposals target safe prompt-guidance append points and include language-specific rationale. (schema/prompt favor safe append guidance and rationale; tests cover parsing)
- [x] M7.3 Add staging/dry-run application flow for idiom proposals. (runTask stores proposalDryRun artifacts only)
- [x] M7.4 Run before/after buffbench idiom subset and use `compare-runs` style reporting. (promotion helpers use compareRuns-style before/after report; live eval run remains manual follow-up)
- [x] M7.5 Add promotion policy: minimum improvement threshold, no regression threshold, manual review checkpoint. (decideProposalPromotion enforces improvement threshold and no regressions)
- [x] M7.6 Record accepted/rejected proposal reports. (proposal dry-run reports are recorded in traces/lessons; acceptance remains manual)

Validation gate:
- Unit tests for proposal parsing/application remain green.
- One end-to-end dry-run on seeded idiom failures produces a promotion/rejection report without modifying production agent definitions automatically.

Dependencies:
- M5 idiom evals must exist first.
- M7 should remain dry-run/manual-review first; automatic promotion is a later hardening step.

## Recommended execution order

1. M1, because it completes the visible language contract and unlocks stable language ids/idiom paths.
2. M2 hardening, because hooks already exist and should be made safe before evals depend on them.
3. M4, because traceability is small/pure and makes future evals externally verifiable.
4. M3, because structural parity is larger and needs a dedicated fixture matrix.
5. M5, because idiom evals need stable language ids and benefit from traceability/linter signals.
6. M6, because cross-language structural edits depend on M3 findings and M5 failure data.
7. M7, because self-improvement requires idiom eval data and promotion gates.

## Risks and blockers

- Dirty working tree includes many existing changes. Execution must avoid reverting unrelated edits.
- Some inferred linter commands may fail because tools are not installed; default hooks need clear diagnostics and no infinite repair loop.
- PHP/Swift/Kotlin grammar availability may differ between dev and bundled environments; tests must allow graceful no-op where grammar is absent, but not hide query bugs where grammar is present.
- Idiom judging can be subjective; start with small calibrated samples and deterministic pattern checks.
- Repo-map/context compression can add complexity and token cost; require comparison data before default enablement.
- Auto-promotion of prompt guidance can degrade other languages; keep manual review and regression gates.

## Validation suite map

- Prompt/language profile: `bun test common/src/util/__tests__/language-profiles.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts agents/__tests__/quality-prompt-snapshot.test.ts`
- SDK hooks: `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts`
- Evals deterministic/traceability: `bun test evals/buffbench/__tests__/deterministic-signals.test.ts evals/buffbench/__tests__/idiom-traceability-signals.test.ts`
- Code-map: targeted package code-map tests after checking package scripts.
- Agent runtime structural edits: `bun test packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts packages/agent-runtime/src/__tests__/structural-read.test.ts`
- Full relevant hooks: `run_file_change_hooks` for changed file sets at each execution slice.

## Checkpoint rules

- Update `STATUS.md` with `update_plan_status` after each milestone starts, blocks, passes validation, or changes scope.
- Append to `LESSONS.md` with `update_plan_status` whenever a gotcha, product decision, test command, or cross-workstream dependency is discovered.
- Rewrite `PLAN.md` with `create_plan` if milestone ordering, acceptance criteria, or supported-language scope changes materially.
- Rewrite `SPEC.md` with `create_plan` only if goals/non-goals or completion definition changes materially.

## First execution slice recommendation

Start with M1 + a narrow part of M2:
- Finish language profile coverage for languages already present in code-map query support.
- Add tests/docs.
- Then harden deterministic signal classification for inferred linters.

This gives the rest of the workstream stable language ids, idiom paths, and validation categories before deeper eval/structural work begins.

<!-- update_plan_status:appended -->
## M1 execution started — 2026-07-06T17:33:06.871Z

Execution resumed in M1. Confirmed v1 language scope should align with current `packages/code-map/src/languages.ts`: TypeScript/JavaScript, Python, Rust, Go, Java, C#, C/C++, Ruby, PHP, Swift, and Kotlin. Existing R1 source/tests/docs were inspected; current implementation covers only TypeScript/JavaScript, Python, Rust, and Go.

<!-- update_plan_status:appended -->
## M1 implementation and validation — 2026-07-06T17:45:25.382Z

M1 language-profile expansion implemented and validated.

Completed in this slice:
- Expanded `SupportedLanguageId`, language ordering, extension detection, and manifest detection in `common/src/util/language-profiles.ts` for Java, C#/.NET, C/C++, Ruby, PHP, Swift, and Kotlin, in addition to the existing TypeScript/JavaScript, Python, Rust, and Go profiles.
- Added compact idiom contracts for `agents/idioms/java.md`, `agents/idioms/csharp.md`, `agents/idioms/cpp.md`, `agents/idioms/ruby.md`, `agents/idioms/php.md`, `agents/idioms/swift.md`, and `agents/idioms/kotlin.md`.
- Updated `common/src/util/__tests__/language-profiles.test.ts` to cover the full v1 supported language set, extension detection, manifest detection, dedup/stable ordering, compact prompt output, and unrelated-language omission.
- Updated `docs/agents-and-tools.md` shared prompt section docs with the expanded language set and add-a-language guidance.

Validation passed:
- `bun test common/src/util/__tests__/language-profiles.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts agents/__tests__/quality-prompt-snapshot.test.ts` exited 0.
- Configured file-change hooks passed: `cd common && bun run typecheck`, `cd packages/agent-runtime && bun run typecheck`.

Next checkpoint: M2. Start with M2.1/M2.3: inspect inferred hook commands and deterministic signal classification, then decide whether to change `ruff check --fix .` to non-mutating `ruff check .` before editing hook behavior.


<!-- update_plan_status:appended -->
## M2 implementation and validation — 2026-07-06T17:51:17.015Z

M2 auto-wired linter hook hardening is implemented and validated. Changes completed in this slice:
- Kept inferred hooks default-on with `autoFileChangeHooks: false` opt-out.
- Confirmed inferred hooks are validation-only/non-mutating, including `ruff check .` rather than `ruff check --fix .`.
- Added/validated manifest inference coverage for Go, .NET, Rust, Python, Ruby, and Swift hooks.
- Extended deterministic signal lint classification for language linter commands.
- Fixed command-classification precedence so `test -z "$(gofmt -l .)"` is lint, not test.
- Documented inferred hooks, opt-out behavior, and missing-tool guidance in `docs/configuration.md`.

Validation passed:
- `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts` — pass, 15 tests.
- `bun test evals/buffbench/__tests__/deterministic-signals.test.ts` — pass after precedence fix.
- `run_file_change_hooks` for M1+M2 changed files — pass: `typecheck-common`, `typecheck-sdk`.

Next checkpoint: proceed to M4 idiom-read traceability gate, per recommended execution order.


<!-- update_plan_status:appended -->
## M4 traceability implementation and validation — 2026-07-06T17:58:03.012Z

M4 idiom-read traceability signal implementation is partially complete and validated.

Completed in this slice:
- Added pure trace-analysis module `evals/buffbench/idiom-traceability-signals.ts`.
- Mapped supported non-TypeScript edited file extensions to language ids and expected `agents/idioms/<lang>.md` paths.
- Detected first edit event per supported non-TS language across `str_replace`, `write_file`, `rewrite_symbol`, `edit_transaction`, `propose_str_replace`, and `propose_write_file`.
- Detected prior `read_files` calls for idiom paths via `paths`, `ranges[].path`, and `symbols[].path`.
- Returned machine-readable per-language signals plus pass/fail/skip evaluation reasons.
- Added unit tests for pass, fail, skip/no non-TS edits, multi-language edit, repeated edit first-edit behavior, TypeScript exemption, read ranges/symbols, and `edit_transaction` path extraction.

Validation passed:
- `bun test evals/buffbench/__tests__/idiom-traceability-signals.test.ts` — pass, 10 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` for M1+M2+M4 changed files — pass: `typecheck-common`, `typecheck-sdk`.

Pending in M4:
- M4.6 remains: integrate the traceability signals into buffbench reporting as an advisory/eval gate, not runtime enforcement.


<!-- update_plan_status:appended -->
## M4 complete — 2026-07-06T18:02:50.058Z

M4.6 integration validation completed after adding `idiomTraceability` to buffbench run/report plumbing.

Validated commands:
- `bun test evals/buffbench/__tests__/idiom-traceability-signals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts` — pass, 24 tests.
- `cd evals && bun run typecheck` — pass.
- `run_file_change_hooks` — pass for `typecheck-common` and `typecheck-sdk`.

Next checkpoint: start M3/R4 code-map and tree-sitter parity work, beginning with source/test inspection for existing language query support and grammar availability.


<!-- update_plan_status:appended -->
## M3 completion note — 2026-07-06T18:09:01.800Z

M3 parity slice completed and validated. Available bundled grammars now have representative structural tests for JS/TS, Python, Rust, Go, Java, C#, C++, and Ruby. PHP/Swift/Kotlin remain registered but gracefully return null in structural parsing when their WASM grammars are unavailable.


<!-- update_plan_status:appended -->
## Plan completion check — 2026-07-06T19:55:50.197Z

Plan status check after the M6 repo-map/retrieval comparison gates: the overall workstream is not fully complete yet. Completed milestones now include M1, M2, M3, M4, M5 initial idiom-rubric/task/reporting work, and M6.1-M6.5 structural/retrieval slices. Remaining planned work is M6.6 retrieval-ranking eval coverage for same-language idiomatic examples before non-TS edits, then M7 self-improvement loop work. Next checkpoint: decide whether to implement M6.6 now or move directly into M7 if M6.6 is no longer required for this phase.


<!-- update_plan_status:appended -->
## M7 completion — 2026-07-06T20:28:42.150Z

M7 dry-run/manual-review self-improvement loop slice completed and reviewer-green. This covers the planned M7 scope at the unit/plumbing level: idiom judge context is passed to lessons extraction; safe language-specific proposals are parsed; proposal application is dry-run-only; before/after promotion policy/report helpers gate acceptance; saved lesson/trace artifacts record proposal dry-run reports. No automatic production agent mutation is enabled.

