# STATUS: Cross-language idiom quality — one-week + one-year workstream

## Current state

**Phase:** research-and-recommendation complete; four-artifact packet ready for review; no execution (plan mode).

**Session slug:** `cross-language-idiom-quality-2026-07-06`

**Completed this turn:**
- Verified the three failure modes that ground the diagnosis, via parallel file-picker + code-searcher shards:
  1. **Prompt pollution confirmed** — `frontendSection` injected unconditionally at `agents/base2/base2.ts:314`, `agents/base2/base-deep.ts:130`, AND `agents/editor/editor.ts:194` (code-searcher returned all three sites with line numbers this turn).
  2. **Example/idiom deficit confirmed** — `qualitySection` (byte-frozen at `agents/__tests__/quality-prompt-snapshot.test.ts:22`) hardcodes `package.json`/`Cargo.toml`/`requirements.txt`/`build.gradle`; `base2.ts:144–168` Code Editing Mandates duplicate it (lines 147, 159, 167).
  3. **No corrective loop confirmed** — only `tsc`/`eslint` wired; `clippy`/`ruff`/`golangci-lint`/`rubocop`/`swift-format`/`dotnet format` are not auto-wired.
- Verified the existing substrate so execution doesn't re-invent:
  - `common/src/util/patterns.ts:125` — `formatPatternsIndexPrompt` (the glob-detected-injection pattern R1 mirrors; empty index → empty string).
  - `packages/agent-runtime/src/system-prompt/prompts.ts:14` — `knowledgeFilesPrompt` (slot for R1).
  - `packages/agent-runtime/src/templates/strings.ts:189` — `PLACEHOLDER.PATTERNS_INDEX` wiring (R1 adds `PLACEHOLDER.LANGUAGE_PROFILE`).
  - `sdk/src/provider-config.ts:792` — `mergeFileChangeHooks` (concat-with-dedup, override wins; R2 auto-wires linters without clobbering user overrides).
  - `evals/buffbench/proposals.ts:38,233,326` — `append_system_prompt_guidance` proposal kind (Q3 auto-promotion seam).
  - `evals/buffbench/lessons-extractor.ts:61-86` — proposal extractor.
  - `evals/buffbench/plan-sharding-signals.ts:535` — `evaluateMinimumShardRule` (template for Q1 read-traceability gate).
  - `evals/buffbench/deterministic-signals.ts` — `clampScoresByDeterministicSignals` (lint/test/compile caps an idiom-rubric judge plugs into).
- Authored SPEC.md + PLAN.md for this session; captured both the one-week R1–R6 plan and the four-quarter Q1–Q3 roadmap as one resumable workstream.

**Pending (in-flight):**
- STATUS.md (this file) + LESSONS.md creation — final two artifacts.

**Not in scope (explicitly deferred to execution sessions):**
- Implementing any R/Q item. Each execution spawns a separate session (e.g., `.agents/sessions/idiom-quality-tier1-<date>/`).
- Resolving O1 (tree-sitter query inventory) — that's a Q2-blocking read task, not part of this packet's research scope.

## Next checkpoint

Hand the packet to the user for review and a go/no-go decision on the cheapest first move: **R3 (gate `frontendSection`) + R5 (generalize the Code Editing Mandates)** — both prompt-assembly-only, near-zero cost, and they remove the biggest pollution source immediately. If approved, spawn a fresh execution session carrying forward only the touch-points + validation gates; keep this packet as the recommendation-of-record.

## Blockers / open questions (carried into PLAN.md)

- **O1. Tree-sitter query inventory (blocking for Q2).** The file picker this turn found only `packages/code-map/src/tree-sitter-queries/tree-sitter-typescript-tags.scm` on disk, but `packages/code-map` is supposed to support 13 languages. Must verify how non-TS symbol extraction happens today (different `.scm` path? code-map fallback? inferred from grammar?) before sizing R4 or the Q2 `rewrite_symbol` extension.
- **O2. Auto-wired linter retry cap.** Same constraint as the sibling `read-edit-tool-improvements-from-aider-*` packet R1. Coordinate the two packets' fixes — auto-edit loops need a max-retry cap per file per turn.
- **O3. Opt-in vs. default (product question).** Auto-wired linters: ship by default with a disable flag, or gate behind per-project opt-in?
- **O4. Idiom-rubric judge calibration.** No published idiom-compliance benchmark exists; we are building the field's first. Judge agreement must be measured before Q3 auto-promotion can trust it.
- **O5. Snapshot test churn.** `qualitySection` is byte-frozen; R5 forces a snapshot-test update. Plan the test update in the same execution unit as the prose change.
- **O6. Coordination with two sibling packets.** `rewrite_symbol` cross-language extension appears here (Q2) and in the `read-edit-tool-improvements-from-aider-*` packet R6; Aider-style repo map appears here (Q2) and there too. Decide whether to merge those workstreams into one execution session or sequence them with shared lessons.

## Resume instructions

1. Read SPEC.md + PLAN.md + LESSONS.md (this session dir).
2. The deliverable for review is the tiered recommendation list in PLAN.md §"Part A — One-week plan" + §"Part B — One-year roadmap."
3. If executing Tier 1 (R3 + R5 first): spawn a new session under `.agents/sessions/idiom-quality-tier1-<date>/` and carry forward only the touch-points and validation gates from PLAN.md; keep this packet as the recommendation-of-record.
4. Before Q2 execution, resolve O1 (tree-sitter query inventory) by reading `packages/code-map` directly.
5. Before R2 execution, coordinate O2 (retry cap) with the sibling `read-edit-tool-improvements-from-aider-*` packet R1.
6. Before Q3 execution, resolve O4 (judge calibration) — the auto-promotion gate cannot trust an unmeasured judge.

## Confidence

High. All three failure modes were verified with concrete file:line citations this turn. The substrate checks confirm R1/R2/R3 touch existing tested plumbing (no greenfield infra). The one open substrate question (O1 — tree-sitter query inventory) is scoped to Q2 sizing, not to the Tier 1 (R3/R5) first move, so it does not gate the immediate next checkpoint.

<!-- update_plan_status:appended -->
## Tier 1 R3/R5 Execution Started — 2026-07-06T14:16:19.435Z

EXECUTE_PLAN resumed from the recommendation packet. Starting the cheapest first execution slice: R3 (gate `frontendSection` so React/frontend guidance is conditional) plus R5 (generalize TypeScript-specific Code Editing Mandates wording). Next action is fresh inspection of the prompt section, injection sites, and relevant snapshot tests before source edits.

<!-- update_plan_status:appended -->
## Tier 1 R3/R5 Validation Passed — 2026-07-06T14:29:47.391Z

Tier 1 R3/R5 targeted validation passed.

Command run:
`bun test agents/__tests__/quality-prompt-snapshot.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts`

Result: exit code 0; 28 tests passed, 0 failed, 2 snapshots checked.

Coverage confirmed:
- `qualitySection` snapshot remains byte-stable after generalized cross-language manifest wording.
- `base2`, `base-deep`, and `editor` now contain `PLACEHOLDER.FRONTEND_SECTION` rather than inlining `frontendSection` directly.
- `getAgentPrompt` omits frontend guidance for a Python-only file tree and includes it for `.tsx` / `.jsx` file trees.

Next checkpoint: summarize the completed Tier 1 R3/R5 work and note that broader unrelated dirty-tree changes remain out of scope.


<!-- update_plan_status:appended -->
## Full Agents Validation Attempt — 2026-07-06T14:41:19.854Z

Attempted the requested full agents validation command:
`cd agents && bun run typecheck && bun test`

Result: exit code 1.

Typecheck completed and the test run progressed through the agents suite, but `bun test` also executed `agents/browser-use/browser-use.test.ts`, which is a standalone browser-agent script and failed with:
`browser-use agent not found in agents/ directory`

This failure is outside the R3/R5 prompt-section changes and the docs update. The narrower prompt-focused validation had already passed:
`bun test agents/__tests__/quality-prompt-snapshot.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts`

No source fix was applied for the browser-use script because it is unrelated to the pending prompt/docs files and changing test discovery behavior would expand scope. Next checkpoint: report the validation blocker clearly and ask whether to scope a follow-up fix for the standalone browser-use test script/package test command.


<!-- update_plan_status:appended -->
## R2 Product Decision — 2026-07-06T15:04:18.046Z

Product decision recorded for R2: auto-wired language-specific linter hooks should be enabled by default, with an explicit disable flag/setting for projects that need to opt out. This resolves O3 for future R2 execution; implementation remains pending behind the R1 language-profile prompt slice unless the user re-prioritizes R2.


<!-- update_plan_status:appended -->
## R1 Language Profile Execution Resumed — 2026-07-06T15:11:06.093Z

Resuming EXECUTE_PLAN after the R3/R5 prompt-gating slice and R2 product decision. Next execution target is the next incomplete one-week item: R1 language-profile injection/idiom files. Current dirty tree already contains R3/R5 edits plus apparent R1-related files (`agents/idioms/`, `common/src/util/language-profiles.ts`, template placeholder changes), so first action is to inspect those exact files and tests before deciding whether to finish, fix, or validate R1.


<!-- update_plan_status:appended -->
## R1 Language Profile Validation Passed — 2026-07-06T15:15:10.540Z

R1 language-profile MVP is implemented and targeted validation passed.

Implemented coverage includes:
- `common/src/util/language-profiles.ts` detects TypeScript/JavaScript, Python, Rust, and Go from `ProjectFileContext.fileTree` extensions/manifests and renders a compact `{CODEBUFF_LANGUAGE_PROFILE}` prompt.
- `agents/idioms/{typescript,python,rust,go}.md` provide on-demand idiom guidance without inlining all languages into the system prompt.
- `base2`, `base-deep`, and `editor` carry `{CODEBUFF_LANGUAGE_PROFILE}` and conditional `{CODEBUFF_FRONTEND_SECTION}` placeholders instead of unconditional frontend guidance.
- `packages/agent-runtime/src/templates/__tests__/strings.test.ts`, `agents/__tests__/quality-prompt-snapshot.test.ts`, and `common/src/util/__tests__/language-profiles.test.ts` cover placeholder injection, frontend gating, and language-profile detection/rendering.

Validation:
- Configured file-change hooks passed: `typecheck-common`, `typecheck-agents`, `typecheck-agent-runtime`.
- Targeted command passed: `bun test common/src/util/__tests__/language-profiles.test.ts packages/agent-runtime/src/templates/__tests__/strings.test.ts agents/__tests__/quality-prompt-snapshot.test.ts`.

Next checkpoint: R1/R3/R5 prompt work is ready for final summary. R2 linter-hook implementation remains pending for a future execution slice; product decision is already recorded as default-on with explicit disable.


<!-- update_plan_status:appended -->
## R1 Aux Gate Outcomes — 2026-07-06T15:49:17.233Z

Aux gates ran for the R1 language-profile pending file set (`common/src/util/__tests__/language-profiles.test.ts`, `agents/idioms/`, `common/src/util/language-profiles.ts`).

Outcomes:
- `test-writer` inspected `common/src/util/language-profiles.ts` and attempted the inferred agents package command: `cd agents && bun run typecheck && bun test`.
- Agents typecheck completed, and the agents test suite passed through the relevant prompt/quality coverage, including `agents/__tests__/quality-prompt-snapshot.test.ts`.
- The full `cd agents && bun run typecheck && bun test` command still exits 1 because `agents/browser-use/browser-use.test.ts` reports `browser-use agent not found in agents/ directory`. This is the same unrelated standalone browser-use test discovery failure recorded earlier, not an R1 language-profile regression.
- `doc-writer` inspected `common/src/util/language-profiles.ts` and `docs/agents-and-tools.md`; the existing Shared Prompt Sections documentation already covers `{CODEBUFF_LANGUAGE_PROFILE}`, detected languages, compact prompt rendering, and on-demand `agents/idioms/<lang>.md` reads, so no additional doc edit was needed.

Current validation state remains: configured file-change hooks passed (`typecheck-common`, `typecheck-agents`, `typecheck-agent-runtime`) and targeted R1 prompt tests passed. The only known failing broader command is the pre-existing unrelated browser-use test path in the agents package.


<!-- update_plan_status:appended -->
## R1 Typecheck Repair Passed — 2026-07-06T15:55:44.778Z

Repair follow-up for R1 validation hook failure:

- `typecheck-common` failed on `common/src/util/__tests__/language-profiles.test.ts` because the test imported `FileTreeNode` from `../../file`, which resolves to `common/src/file` instead of `common/src/util/file`.
- Fixed the import to `../file` in `common/src/util/__tests__/language-profiles.test.ts`.
- Re-ran configured hooks for the pending R1 files via `run_file_change_hooks`; `typecheck-common` passed with exit code 0.

Next checkpoint: R1 remains validation-clean for the common hook; broader agents package test discovery still has the unrelated `agents/browser-use/browser-use.test.ts` issue recorded earlier.


<!-- update_plan_status:appended -->
## R2 outcome — 2026-07-06T17:11:16.351Z

R2 linter-hook implementation slice completed.

Changed files:
- `sdk/src/tools/file-change-hooks.ts` now auto-inferrs default-on lint/format hooks from manifests: package.json lint/typecheck, gofmt/go vet, cargo fmt/cargo clippy, ruff for pyproject/requirements, rubocop, swift-format, and dotnet format.
- `sdk/src/provider-config.ts` preserves explicit `autoFileChangeHooks` true/false through config merging and setup merges.
- `sdk/src/__tests__/file-change-hooks.test.ts` covers manifest-inferred hooks and existing merge/dedup behavior.

Validation:
- Harness hook: `typecheck-common` passed.
- Targeted SDK validation passed: `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts` (15 pass, 0 fail).


<!-- update_plan_status:appended -->
## R2 validation follow-up — 2026-07-06T17:12:39.182Z

Additional configured hook validation passed after final inspection:
- `run_file_change_hooks` for `sdk/src/tools/file-change-hooks.ts`, `sdk/src/provider-config.ts`, and `sdk/src/__tests__/file-change-hooks.test.ts` ran `cd sdk && bun run typecheck` as `typecheck-sdk` and exited 0.


<!-- update_plan_status:appended -->
## O1 Resolved — Code-map tree-sitter inventory — 2026-07-06T18:37:43.223Z

O1 resolved by direct inspection of `packages/code-map`.

Findings:
- `packages/code-map/src/tree-sitter-queries/` contains 13 bundled `*-tags.scm` query files, not only TypeScript: TypeScript, JavaScript, Python, Java, C#, C++, Rust, Ruby, Go, PHP, Swift, Kotlin, and C.
- `packages/code-map/src/languages.ts` imports the language query files and registers 13 `languageTable` entries for `.ts`, `.tsx`, JS variants, `.py`, `.java`, `.cs`, `.cpp`/`.hpp`, `.rs`, `.rb`, `.go`, `.php`, `.swift`, `.kt`, and `.kts`.
- Token/call extraction in `packages/code-map/src/parse.ts` uses each language config's tree-sitter parser plus tags query captures (`identifier` and `call.identifier`).
- Structural symbol extraction in `packages/code-map/src/structure.ts` does not use the tags queries directly; it walks the tree-sitter AST and normalizes definition node kinds across languages.
- `packages/code-map/src/__tests__/structure.test.ts` currently covers structural extraction for TypeScript, Python, Go, Rust, JavaScript, Java, C#, C++, and Ruby.
- PHP/Swift/Kotlin are registered, but tests document that their WASM grammars may be absent in `@vscode/tree-sitter-wasm`; `parseFileStructure` currently returns `null` for those when grammar load is unavailable.

Conclusion:
- The prior O1 concern was stale/incomplete discovery. Query inventory exists for 13 languages.
- R4 should be reframed from "find/add missing non-TS query files" to "parity audit and gap-fill between tags-query token extraction and AST structural extraction, especially PHP/Swift/Kotlin runtime grammar availability and missing structural tests."


<!-- update_plan_status:appended -->
## Next slice decision after O1 — 2026-07-06T18:41:36.923Z

Decision based on O1 resolution:

- Do not start a new R4 implementation slice by adding query files; the 13-query inventory already exists.
- Treat the next executable slice as validation/reviewer closure for the already-pending R1/R2/R3/R5/R6 work, because the harness phase is `awaiting_validation` and the pending gate file list spans language profiles, idioms, file-change hooks, buffbench idiom signals, docs, and code-map parity tests.
- Defer any additional R4 implementation to a separate parity-audit slice whose first task is to compare runtime grammar availability and structural AST extraction by language, especially PHP/Swift/Kotlin.

Next action: run targeted tests for the pending validation gate files, then run reviewer gate on the changed source set.


<!-- update_plan_status:appended -->
## Final validation and reviewer gate passed — 2026-07-06T18:51:45.625Z

Final validation/reviewer gate completed for the pending cross-language idiom quality work.

Validation passed:
- `bun test common/src/util/__tests__/language-profiles.test.ts sdk/src/__tests__/file-change-hooks.test.ts evals/buffbench/__tests__/deterministic-signals.test.ts evals/buffbench/__tests__/idiom-traceability-signals.test.ts evals/buffbench/__tests__/run-buffbench.test.ts packages/code-map/__tests__/languages.test.ts packages/code-map/src/__tests__/structure.test.ts` — exit code 0.
- `bun run typecheck` — exit code 0; all package typechecks passed.
- After reviewer fixes, focused rerun passed: `bun test sdk/src/__tests__/file-change-hooks.test.ts evals/buffbench/__tests__/idiom-traceability-signals.test.ts` — exit code 0.
- After reviewer fixes, `bun run typecheck` passed again — exit code 0.

Reviewer gate:
- Initial code review found three blocking issues: inferred package hooks ran repo-controlled package scripts; proposal edit tools counted as applied edits for idiom traceability; malformed `package.json` could crash hook inference.
- Fixes applied: package hook inference now uses fixed dependency-based commands instead of `bun run <script>`; malformed `package.json` is ignored; proposal tools are excluded from applied-edit traceability.
- Security reviewer found no exploitable issues in the corrected hook/traceability changes.
- Final code reviewer returned `LOOKS_GOOD` with no blocking correctness/security issues.

Current state: validation and reviewer gates are complete for the pending file list. The worktree still contains broader unrelated/parallel changes from this plan and sibling packets; no git commit was made.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — configuration docs package hook inference — 2026-07-06T18:56:46.941Z

Resolved the blocking reviewer feedback in `docs/configuration.md` by updating the `package.json` inferred-hook row to match the implementation: Openbuff only infers fixed dependency-based commands (`bunx eslint .` for `eslint`, `bunx tsc --noEmit` for `typescript`) and does not execute repo-controlled `package.json` scripts by default. Added the trust/safety rationale that package scripts only run when users explicitly configure them as `fileChangeHooks`.

Validation: ran configured file-change hooks for `docs/configuration.md`; hooks skipped because no configured hook matched docs-only changes. This is expected for the documentation-only fix.


<!-- update_plan_status:appended -->
## R2 non-blocking fix + R6 seam confirmation — 2026-07-06T23:35:32.342Z

R2 reviewer NON_BLOCKING fix + R4/R6 awareness slice completed.

Non-blocking fix (reviewer note): the inferred Ruby hook now uses the plain `rubocop` command instead of `bundle exec rubocop`, so projects without a checked-in `Gemfile.lock` or that run RuboCop outside Bundler still benefit from the auto-wired lint hook. Updated the focused inference test expectation to match.

R4/R6 scoping confirms the cross-language seam is already wired:
- `evals/buffbench/deterministic-signals.ts:77-84` extends `classifyCommand` to classify `cargo clippy`/`cargo fmt`/`ruff`/`go vet`/`gofmt`/`rubocop`/`swift-format`/`dotnet format` as `'lint'`, so R2's auto-wired linter exit codes feed the lint cap (not the generic cap of 6).
- Focused coverage at `evals/buffbench/__tests__/deterministic-signals.test.ts:64-79` already asserts each auto-wired linter classification.
- Tree-sitter query inventory (O1) for R4 lives at `packages/code-map/src/tree-sitter-queries/*-tags.scm` (13 languages already present), so R4 sizing is not blocked by missing `.scm` files.

Validation:
- Targeted SDK validation passed: `cd sdk && bun run typecheck && bun test src/__tests__/file-change-hooks.test.ts` (15 pass, 0 fail).
- Configured `typecheck-sdk` hook passed for the changed SDK files.

