# SPEC: Complete cross-language idiom quality workstream

## Overview

Bring the cross-language idiom-quality plan from MVP/partial implementation to completion across prompt injection, linter hooks, tree-sitter parity, idiom-compliance evals, traceability gates, structural/retrieval improvements, and the self-improvement loop.

Current observed state:
- R1 is partially implemented as a 4-language MVP: TypeScript/JavaScript, Python, Rust, Go.
- R2 is mostly implemented with default-on inferred file-change hooks and `autoFileChangeHooks: false` opt-out.
- R4 blocker is partially resolved: `packages/code-map/src/tree-sitter-queries/` contains 13 `.scm` files and `packages/code-map/src/languages.ts` imports/registers non-TS queries. Parity quality still needs audit and improvement.
- R6/Q1/Q2/Q3 remain largely unimplemented beyond existing generic buffbench/proposal/rewrite-symbol substrate.

## Goals

- Finish R1 by expanding language-profile coverage and tests beyond the MVP where the product intends first-class support.
- Finish R2 by hardening inferred linter hooks, documentation, opt-out semantics, and deterministic signal integration.
- Complete R4 by auditing and improving non-TS tree-sitter symbol extraction parity for query_index, read_outline/read_files(symbols), and future structural edits.
- Implement R6 idiom-compliance buffbench coverage with language-specific rubrics and judge outputs.
- Implement Q1 traceability gates that verify non-TS edits consult the matching `agents/idioms/<lang>.md` before first edit.
- Advance Q2 structural/retrieval improvements: non-TS `rewrite_symbol` confidence, repo-map/context compression evaluation, and better non-TS retrieval examples.
- Implement Q3 self-improvement loop from idiom failures to lessons/proposals to validated prompt-guidance promotion.
- Keep existing user/uncommitted work intact; do not revert unrelated dirty-tree changes.

## Non-goals

- Do not introduce heavyweight LSP integration as the first solution.
- Do not inject all idiom files into every prompt.
- Do not make auto-linters execute destructive project commands by default.
- Do not auto-promote prompt changes without buffbench validation and regression checks.
- Do not require every language in the long-term list to be complete before shipping the next useful milestone; sequence by value/risk.

## Requirements

### R1 — Language-profile injection completion
- Expand `SupportedLanguageId` and idiom files beyond the current 4-language MVP, prioritizing languages already represented in code-map/query support and linter detection: JavaScript/TypeScript, Python, Rust, Go, Java, C#, C/C++, Ruby, PHP, Swift, Kotlin; optionally Bash/SQL/Terraform if product wants idiom prompts without tree-sitter parity.
- Keep the prompt compact: detected-language summary plus pointers to `agents/idioms/<lang>.md`, not full idiom bodies.
- Preserve frontend gating via `{CODEBUFF_FRONTEND_SECTION}`.
- Add tests for each newly supported language via extension and/or manifest detection.
- Add docs for adding a new language profile and idiom file.

### R2 — Auto-wire language linters completion
- Keep product behavior default-on with explicit disable flag (`autoFileChangeHooks: false`).
- Harden inferred hooks so missing tools produce actionable output without causing infinite edit/retry loops.
- Confirm hooks merge with user hooks from config fragments/openbuff.d without clobbering user intent.
- Extend deterministic command classification for language linters (`cargo clippy`, `cargo fmt`, `ruff`, `go vet`, `gofmt`, `rubocop`, `swift-format`, `dotnet format`) so lint category caps apply consistently.
- Document behavior and opt-out.

### R4 — Tree-sitter parity audit and improvements
- Inventory every registered language in `packages/code-map/src/languages.ts` against its `.scm` query file and actual symbol extraction behavior.
- Define a parity matrix: functions, methods, classes/types, imports, exports/modules, constants/fields where applicable.
- Add fixtures/tests proving representative extraction for non-TS languages.
- Improve `.scm` queries where gaps are found.
- Validate query_index/read_outline/read_files(symbols) behavior across representative files.

### R6 — Idiom-compliance evals
- Add buffbench idiom tasks for Python, Rust, Go first; then expand to TypeScript and additional languages.
- Create rubric metadata that distinguishes functional correctness from idiomatic quality.
- Add judge outputs: `idiomScore` and `nonIdiomaticPatternsDetected`.
- Add deterministic or semi-deterministic pattern checks where feasible (e.g. Rust `unwrap()` overuse, missing `%w` in Go error wrapping, path string manipulation instead of pathlib in Python).
- Add sample tests for rubric parsing and scoring.

### Q1 — Traceability gate
- Implement a pure trace-analysis rule: for non-TS edits, verify `read_files` of the matching `agents/idioms/<lang>.md` occurred before the first edit to files in that language.
- Mirror the style of `evaluateMinimumShardRule`: pure function, unit-tested, produces machine-readable signals and human-readable reasons.
- Integrate the gate into buffbench/eval reporting first; only consider runtime enforcement after eval data proves value.

### Q2 — Structural/retrieval improvements
- Add cross-language `rewrite_symbol` tests for Python, Rust, Go, and at least one class/method-heavy language such as Java/C#.
- If `rewrite_symbol` already works via code-map for some languages, document support level and strengthen tests instead of rewriting internals.
- Add fallback guidance for languages where parser/WASM/query coverage is incomplete.
- Evaluate Aider-style repo-map/context compression as an auxiliary retrieval layer; ship only after comparing against query_index/read_outline on non-TS repos.
- Improve retrieval ranking/tests so idiomatic examples in same-language files are surfaced before edits.

### Q3 — Self-improvement loop
- Feed idiom-rubric failures into `lessons-extractor` with judge context that includes `idiomScore` and `nonIdiomaticPatternsDetected`.
- Generate `append_system_prompt_guidance` proposals targeting language profile/agent guidance.
- Apply proposals in staging/dry-run mode, run buffbench idiom tasks, compare before/after, and promote only improvements with no cross-language regression.
- Record promotion decisions and rejected proposals.

## Acceptance criteria

- R1: Tests prove language profiles for all chosen supported languages render only relevant idiom pointers and omit unrelated languages.
- R2: Tests prove inferred hooks, user-hook merging, opt-out, and deterministic lint classification across the supported hook set.
- R4: Parity matrix is committed; non-TS extraction tests pass; any known unsupported grammar/query gaps are documented.
- R6: Buffbench idiom tasks run for Python/Rust/Go with judge outputs including `idiomScore` and `nonIdiomaticPatternsDetected`.
- Q1: Traceability gate unit tests cover pass/fail/skip and language mapping before first edit.
- Q2: Cross-language `rewrite_symbol` tests and retrieval comparison report exist; shipped improvements are validated with representative fixtures.
- Q3: At least one full dry-run loop from idiom failure -> lesson -> proposal -> staging eval -> accept/reject report is implemented.

## Relevant systems/files

- Prompt profiles: `common/src/util/language-profiles.ts`, `common/src/util/__tests__/language-profiles.test.ts`, `agents/idioms/`, `packages/agent-runtime/src/templates/strings.ts`, `packages/agent-runtime/src/templates/types.ts`, `agents/base2/base2.ts`, `agents/base2/base-deep.ts`, `agents/editor/editor.ts`.
- Hooks: `sdk/src/tools/file-change-hooks.ts`, `sdk/src/__tests__/file-change-hooks.test.ts`, `sdk/src/provider-config.ts`, `docs/configuration.md`, `docs/agents-and-tools.md`.
- Tree-sitter/code map: `packages/code-map/src/languages.ts`, `packages/code-map/src/tree-sitter-queries/*.scm`, `packages/code-map/__tests__/languages*.test.ts`, `packages/agent-runtime/src/structural-read.ts`.
- Structural edits: `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts`, `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts`.
- Evals/self-improvement: `evals/buffbench/deterministic-signals.ts`, `evals/buffbench/plan-sharding-signals.ts`, `evals/buffbench/judge.ts`, `evals/buffbench/lessons-extractor.ts`, `evals/buffbench/proposals.ts`, `evals/buffbench/run-buffbench.ts`, `evals/buffbench/compare-runs.ts`.

## Constraints

- Preserve unrelated dirty-tree changes.
- Avoid broad scripted source rewrites; use targeted edits after fresh reads during execution.
- Validate each milestone with the narrowest relevant suites plus configured file-change hooks.
- Treat missing external linters as a UX/diagnostic problem, not a reason to block all projects.
- Keep prompt guidance token-efficient and conditional.