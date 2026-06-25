# str_replace cascading-corruption hardening — LESSONS

## Decisions made during planning
- Prefer deleting the 0.80 adaptive branch over tightening it: the branch had no ambiguity proof and its sole purpose (landing drifted oldStrings) is already served by the strict 0.92 path with margin gates. Keeping it risks re-introducing the misfire.
- Delimiter-balance check is intentionally bracket-only (`(){}[]`), not quote/backtick aware. Quote balance is language-dependent and noisy; bracket balance catches the actual transcript corruption (orphaned `if` body / split `ActivityRow`) cheaply.
- The circuit breaker counts near-match auto-corrects as "failures" too, because in the transcript the auto-corrects were the corruption vector — a successful-looking auto-correct on the wrong block is worse than a clean error.
- `NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH = 30` chosen to exceed the longest reasonable single-line statement (~20–25 chars) so a single short line cannot auto-correct into a wrong neighbor, while still allowing real multi-line oldStrings.

## Observations from the audit
- `tryNearMatchAutoCorrect` already had a strict 0.92 path with margin + runner-up + subset-safety + location-uniqueness gates. The 0.80 branch bypassed all of those except subset-safety. It was strictly weaker.
- `FileProcessingState` already tracks `failedEditRequiresReadByPath`, but that flag is cleared by any `basedOnRead` presence (even a stale one) and does not count consecutive attempts. A dedicated counter is needed.
- The `getToolValidationHint` for `str_replace` already mentions the top-level shape but not the per-replacement boolean/token/object/integer fields, so a `atomic: "true"` or `basedOnRead: true` error surfaces as raw Zod.

## Risks / gotchas to remember
- The 0.80 branch deletion may break a test that explicitly relied on it. Search `process-str-replace.test.ts` for `0.80` / `adaptive` before assuming the suite is green.
- `FileProcessingState` is exported from `write-file.ts` and consumed by multiple handlers; adding a field is non-breaking but must be initialized where the state object is constructed (check `read-files.ts` / `write-file.ts` initialization sites).
- The delimiter-balance check must run on the *post-replace* content at the matched location, not on the whole file naively (a whole-file scan would double-count brackets elsewhere and be misleading). Use a localized diff.

## Follow-up notes
- None yet.

<!-- update_plan_status:appended -->
## Execution lessons — 2026-06-24 — 2026-06-23T21:35:45.880Z

Five compounding root causes for str_replace cascading-corruption transcripts, ranked by leverage:

1. **0.80 adaptive auto-correct branch (primary, Fix A).** `tryNearMatchAutoCorrect` in `packages/agent-runtime/src/process-str-replace.ts` had an `else if (best.similarity >= 0.80)` path that auto-corrected whenever there was *no other candidate at all*, with no margin check. On a small file, any vaguely-similar block with no runner-up got rewritten — including the wrong case body. Removed it: only the strict 0.92 path with margin/runner-up gates survives.

2. **Delimiter-balance check (Fix B, defense-in-depth).** New `isResultDelimiterBalanced(initialContent, matchedBlock, newStr)` helper applies the candidate replacement at the single occurrence of `matchedBlock` and verifies net `()[]{}` count is unchanged. Catches structurally destructive near-matches even if the similarity gate would have allowed them.

3. **Per-path circuit breaker (Fix C).** Added `consecutiveStrReplaceFailuresByPath: Record<string, number>` to `FileProcessingState` (in `write-file.ts`) and `STR_REPLACE_MAX_CONSECUTIVE_FAILURES = 3` in the str-replace handler. After 3 consecutive failures or auto-corrects on the same path, the handler hard-errors and directs the model to `rewrite_symbol` or `write_file`. Counter resets on a fresh `basedOnRead` capability or a clean exact match.

4. **Schema-edge hints (Fix D).** `getFieldSpecificHint(toolName, issues)` in `packages/agent-runtime/src/tools/tool-executor.ts` inspects Zod issues and emits a one-line schema hint when `atomic` (boolean), `basedOnRead` (token string or object), or `occurrenceIndex` (positive integer) arrive with the wrong type — instead of the generic Zod message that caused the model's `atomic:"false"` loop in the transcript.

5. **Autocorrect oldString floor (Fix E).** `NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH = 30` requires a longer oldString for the auto-correct path specifically (the diagnostic path keeps the lower 10-char floor). Short oldStrings are the most common way to auto-correct into the wrong neighbor.

Harness loop gotchas that cost time during this session:
- `rewrite_symbol` does NOT remove the prior JSDoc block above the rewritten function; it leaves a duplicate. Always follow with a targeted str_replace to delete the orphan comment block.
- The `atomic` field on `str_replace` MUST be a boolean, not a string. The very bug Fix D addresses also bit this session's own edits (passing `atomic: "false"`).
- For files >1000 lines, every str_replace needs a fresh `basedOnRead` capability from the most recent read_files.ranges header. Re-using a stale anchor after an intervening edit produces a deterministic-match failure loop.
- The circuit-breaker test needed a REAL capability token via `encodeReadCapabilityToken(getContentHash(content), startLine, endLine)`, not a stub string; otherwise `processStrReplace` throws during decode before reaching the breaker logic.
- `handleStrReplace` success output uses `{ file, message }` (no `errorMessage`); test assertions must guard the undefined case (`value?.errorMessage` is undefined on success) — `expect(undefined).not.toMatch(...)` throws 'Received value must be a string'.

Validation recipe that worked: `bun run --cwd=packages/agent-runtime typecheck` in parallel with `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts packages/agent-runtime/src/__tests__/tool-validation-error.test.ts`. Final result: typecheck exit 0, 95 pass / 0 fail / 321 expect() calls.
