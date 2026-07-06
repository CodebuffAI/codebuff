# LESSONS: R1/R2 Read/Edit Tool Improvements

## Existing Lessons From Prior R3 Work
- Tiny repeated anchors need explicit safety treatment; `allowMultiple=true` should not turn very short repeated anchors into broad replacements unless the anchor is at the accepted boundary and intentionally covered by tests.
- Boundary tests matter: cover just-below threshold, exact threshold, and escape-hatch behavior such as `occurrenceIndex`.
- Validation output may include noisy stdout from existing parser tests; rely on exit code and test summary rather than treating every stdout diagnostic as a failure.
- Configured file-change hooks may be narrower than the full suite; for runtime edit behavior, run the direct package test suite when behavior changes.

## Planning Lessons
- R1 already has likely helper infrastructure in `agents/base2/gate-repair.ts`; reuse it before adding new prompt-building code.
- R1 loop safety is the central risk. Track repair attempts by pending gate-file set, not by raw command output, to avoid infinite loops and stale failure repair.
- R2 should not make `...` a fuzzy matcher. Treat it as a deliberate documented elision marker with deterministic ambiguity failure.
- replace_range safety is hash/range based. If elision weakens `expectedHash`, scope it out or limit it to user-facing guidance rather than implementation.
- Keep R1 and R2 independent to reduce validation blast radius and make reviewer feedback easier to act on.

## Gotchas To Verify During Execution
- `handleSteps` serialization constraints in `agents/base2/base2.ts`: avoid module-scope bindings inside serialized generator paths unless existing patterns confirm they are safe.
- Gate done-flag reset behavior is order-insensitive by pending file set; do not accidentally reset repair attempts on identical sets.
- `process-str-replace.ts` has multiple matching paths. Add elision after exact matching so existing behavior remains preferred.
- Stale read anchors are common around large edit files. Re-read exact ranges after any failed edit, validation failure, or reviewer blocker.

## Follow-Up Notes
- If R1 implementation touches user-facing repair messages, update deterministic edit docs with the failure-repair lifecycle.
- If R2 introduces a new anchor mini-language, document examples and non-examples to prevent agents from overusing `...`.
- Prefer narrow tests first, full package validation second.

<!-- update_plan_status:appended -->
## R1 Completion Decision — 2026-07-06T13:41:47.285Z

R1 was already implemented in current source when this execution resumed. Treat source inspection as a valid completion path: if planned behavior and tests already exist, do not make redundant edits. Validation commands for the relevant agents files passed (`gate-repair`, `gate-repair-parity`, `base2`, and agents typecheck).

<!-- update_plan_status:appended -->
## R2 Scope Decision — 2026-07-06T13:54:13.583Z

R2 scope decision: keep `replace_range` strict for this slice because its safety model is explicit range + `expectedHash`; supporting `...` there would weaken or complicate hash semantics. Implement `...` only as an explicit line-elision marker in `str_replace`, behind exact-match precedence, with ambiguity and tiny-anchor failures remaining deterministic.


<!-- update_plan_status:appended -->
## Elision allowMultiple Blocker — 2026-07-06T13:57:50.281Z

Reviewer blocker taught that `allowMultiple` must be rejected for explicit `...` elision even when the elided anchor resolves to exactly one range. Ambiguous-elision errors alone are insufficient; keep direct deterministic allowMultiple coverage so docs, error contract, and implementation stay aligned.

