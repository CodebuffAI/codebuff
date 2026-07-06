# PLAN: R1/R2 Read/Edit Tool Improvements

<!-- current-task: none -->

## Milestone 0 — Session Setup
- [x] Create durable planning session for R1/R2.
- [x] Preserve prior R3 completion as a dependency, not active work.
- [x] Identify relevant systems and tests from prior discovery.

## Milestone 1 — R1 Validation-Failure Re-Edit Loop
- [x] Inspect current gate lifecycle in `agents/base2/base2.ts` around `run_file_change_hooks`, reviewer spawning, pending gate files, and gate done flags. (verified already present and covered)
- [x] Inspect `agents/base2/gate-repair.ts` helpers and existing tests to confirm expected parser/prompt behavior. (verified helper/test coverage)
- [x] Design the repair trigger so it fires only on failing hook results and only once per gate-file set unless new edits create a new pending set. (already implemented with bounded repair state)
- [x] Implement the smallest orchestration change that passes parsed failure context to an editor repair prompt. (already present in current source)
- [x] Add tests for: failed hook -> repair editor prompt; passed hook -> no repair; repeated same failing gate set -> no infinite loop; reviewer still waits until validation is green or failure is handled. (existing tests cover acceptance cases)
- [x] Validate with targeted agents tests and typecheck. (agents targeted tests and typecheck passed)

## Milestone 2 — R2 Elision Semantics Decision
- [x] Re-read `packages/agent-runtime/src/process-str-replace.ts` matching cascade and current tiny-anchor guard before editing. (done before R2 edits)
- [x] Re-read `packages/agent-runtime/src/tools/handlers/tool/replace-range.ts`, `sdk/src/tools/replace-range.ts`, and `common/src/tools/params/tool/replace-range.ts` before deciding replace_range scope. (replace_range inspected and scoped out)
- [x] Decide final `...` grammar before implementation. Recommended default: only a documented elision marker inside an explicit structured anchor pattern, not fuzzy matching. (line-level str_replace elision only)
- [x] Document the chosen semantics in PLAN/SPEC if they differ from the recommendation. (scope recorded in STATUS)

## Milestone 3 — R2 str_replace Implementation
- [x] Preserve exact-match precedence and current atomic/large-file behavior. (preserved)
- [x] Add deterministic elision matching behind exact-match paths. (implemented)
- [x] Ensure ambiguous elision matches fail with deterministic guidance and do not partially apply. (implemented with recovery guidance)
- [x] Ensure R3 tiny repeated-anchor refusal still applies to unsafe anchors and has clear interaction with elision markers. (tiny anchors remain guarded)
- [x] Add regression tests in `packages/agent-runtime/src/__tests__/process-str-replace.test.ts`. (added process-str-replace coverage)
- [x] Validate with `cd packages/agent-runtime && bun run typecheck && bun test`. (passed)

## Milestone 4 — R2 replace_range Scope
- [/] If replace_range elision can be implemented without weakening `expectedHash`/range safety, implement it and add SDK/common tests. (scoped out to preserve hash/range safety)
- [x] If not, document that replace_range keeps strict ranges/hashes and `...` is not accepted for range hashes in this slice. (documented as strict range/hash based)
- [/] Update `sdk/src/__tests__/replace-range.test.ts` and relevant docs for the selected scope. (not applicable; SDK/common unchanged)
- [/] Validate SDK/common affected tests and typechecks. (not applicable; SDK/common unchanged)

## Milestone 5 — Documentation and Final Gate
- [x] Update `docs/deterministic-edit-system.md` and `docs/agents-and-tools.md` for R1/R2 behavior. (updated)
- [x] Run configured file-change hooks for changed files. (configured hooks skipped; explicit validation passed)
- [x] Run any broader targeted validation needed by touched packages. (agent-runtime typecheck and tests passed)
- [x] Resolve validation/reviewer blockers before finalizing. (allowMultiple elision blocker fixed and revalidated)
- [x] Update STATUS.md and LESSONS.md at completion. (STATUS updated; lessons already maintained as needed)

## Dependencies / Ordering
- R1 and R2 are independent; implement R1 first if the user wants agent-loop behavior, R2 first if the user wants edit-tool semantics.
- R2 implementation must not start from stale snippets; re-read exact relevant lines after any intervening edit or validation failure.
- Documentation should follow implementation semantics, not precede unresolved decisions.
- Reviewer gate should run after validation results are available if review depends on validation behavior.

## Risks / Blockers
- R1 can accidentally create an infinite validation-repair loop if gate-set identity and done flags are not handled carefully.
- R1 can reorder reviewer behavior if it triggers repair after reviewer spawn rather than before final review.
- R2 can weaken deterministic edit safety if `...` becomes broad fuzzy matching.
- R2 can conflict with the R3 tiny repeated-anchor refusal if elided anchors reduce to tiny repeated fragments.
- replace_range elision may be incompatible with strict `expectedHash` semantics; scope it out rather than weakening hash guarantees.

## Validation Gates
- R1: targeted `agents` gate-repair/base2 tests, then agents typecheck/test command as supported by package scripts.
- R2 str_replace: `cd packages/agent-runtime && bun run typecheck && bun test`.
- R2 SDK/common: SDK replace-range tests/typecheck and any common package checks if params/schema files change.
- Docs-only final edits: configured file-change hooks; no separate docs build unless one is discoverable/required.

## Checkpoint / Update Rules
- Update `STATUS.md` via `update_plan_status` after each milestone starts, completes, blocks, or changes scope.
- Update `LESSONS.md` via `update_plan_status` when implementation reveals gotchas, reviewer blockers, validation failure causes, or reusable decisions.
- Rewrite `PLAN.md` with `create_plan` if R2 semantics or R1 gate lifecycle design materially changes.
- Rewrite `SPEC.md` with `create_plan` if goals/non-goals or acceptance criteria change.

<!-- update_plan_status:appended -->
## Execution Complete — 2026-07-06T14:04:09.304Z

Plan execution finalized after full requested runtime validation passed. R1 was already implemented and validated in current source; R2 was implemented, documented, tested, reviewed after blocker resolution, and validated with `cd packages/agent-runtime && bun run typecheck && bun test` exiting 0.
