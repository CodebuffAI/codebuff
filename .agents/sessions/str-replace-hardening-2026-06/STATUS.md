# str_replace cascading-corruption hardening — STATUS

## Current state
Session bootstrapped. SPEC.md and PLAN.md written. Implementation pending.

## Milestone checklist
- [x] Milestone 1 — Fix A: remove the 0.80 adaptive auto-correct branch (Fixes A/B/E in process-str-replace.ts: 0.80 adaptive branch removed (must clear 0.92 + margin), isResultDelimiterBalanced guard added, NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH=30 for autocorrect path.)
- [x] Milestone 2 — Fix B: delimiter-balance check on near-match results (Fix C: consecutiveStrReplaceFailuresByPath added to FileProcessingState; STR_REPLACE_MAX_CONSECUTIVE_FAILURES=3 hard-blocks further str_replace on a path after 3 failed/auto-corrected attempts; cleared on fresh basedOnRead or clean exact match.)
- [x] Milestone 3 — Fix C: per-path consecutive-failure circuit breaker (Fix D: getFieldSpecificHint in tool-executor.ts emits one-line schema hints when atomic (boolean), basedOnRead (token/object), or occurrenceIndex (positive integer) arrive with wrong types.)
- [x] Milestone 4 — Fix D: sharpen malformed-arg schema-edge errors (Tests added: process-str-replace.test.ts (Fixes A/B/E), str-replace-circuit-breaker.test.ts (Fix C), tool-validation-error.test.ts (Fix D).)
- [x] Milestone 5 — Fix E: raise min oldString length for auto-correct (Validation: bun run typecheck (exit 0); bun test across process-str-replace + str-replace-circuit-breaker + tool-validation-error = 95 pass / 0 fail / 321 expect() calls.)
- [x] Milestone 6 — Tests for all five fixes (Tests added for all five fixes (process-str-replace.test.ts A/B/E, str-replace-circuit-breaker.test.ts C, tool-validation-error.test.ts D).)
- [x] Milestone 7 — Validation (agent-runtime typecheck + focused tests) (bun run typecheck exit 0; focused tests 95 pass / 0 fail / 321 expect() calls.)

## Validation log
- No validation has run yet.

## Resume instructions
1. Continue at the first unchecked milestone above.
2. Apply fixes in order A→E; each fix is localized to 1–2 files.
3. After implementation, run the validation commands listed in PLAN.md.

<!-- update_plan_status:appended -->
## Validation passed — 2026-06-24 — 2026-06-23T21:34:51.085Z

All five fixes (A–E) landed and validated.

Source changes:
- `packages/agent-runtime/src/process-str-replace.ts`: removed the sub-0.92 adaptive auto-correct branch (Fix A), added `isResultDelimiterBalanced` guard that rejects near-matches producing unbalanced `()[]{}` (Fix B), raised the autocorrect oldString floor to `NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH = 30` (Fix E), and threaded `newStr` into `tryNearMatchAutoCorrect`.
- `packages/agent-runtime/src/tools/handlers/tool/str-replace.ts` + `write-file.ts`: added `consecutiveStrReplaceFailuresByPath` to `FileProcessingState`, a `STR_REPLACE_MAX_CONSECUTIVE_FAILURES = 3` circuit breaker that hard-blocks further str_replace on a path after 3 consecutive failures/auto-corrects, and counter reset on fresh `basedOnRead` or clean exact match (Fix C).
- `packages/agent-runtime/src/tools/tool-executor.ts`: added `getFieldSpecificHint` so malformed `atomic` / `basedOnRead` / `occurrenceIndex` params produce a one-line schema hint at the validation edge instead of a generic Zod message (Fix D).

Tests:
- `packages/agent-runtime/src/__tests__/process-str-replace.test.ts`: regression tests for Fixes A (sub-0.92 single-candidate refusal), B (unbalanced-delimiter refusal), E (short-oldString autocorrect refusal).
- `packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts`: Fix C — breaker trips at limit, does not trip below limit, clears on fresh basedOnRead.
- `packages/agent-runtime/src/__tests__/tool-validation-error.test.ts`: Fix D — sharp hints for atomic/basedOnRead/occurrenceIndex type mismatches.

Validation: `bun run typecheck` (exit 0); focused tests 95 pass / 0 fail / 321 expect() calls.
