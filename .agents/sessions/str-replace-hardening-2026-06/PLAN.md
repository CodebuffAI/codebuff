# str_replace cascading-corruption hardening — PLAN

## Goal
Prevent the death-spiral seen in the pasted transcript (repeated near-match auto-corrects corrupting a file across ~10 retries) by hardening five harness behaviors.

## Root causes (from transcript analysis)
1. The `else if (best.similarity >= 0.80)` adaptive branch in `tryNearMatchAutoCorrect` auto-corrects with **no margin check and no runner-up gate** — the direct source of every `auto-corrected a near-match edit (84% similar)` corruption.
2. No per-path consecutive-failure circuit breaker: ~8 sequential failed/auto-corrected `str_replace` calls on the same path before the agent switched tools.
3. Malformed `atomic`/`basedOnRead`/`occurrenceIndex` args produce generic Zod errors instead of shape-specific hints.
4. No structural validity check on the *resulting* content before applying a near-match (an unbalanced-brace result slips through).
5. `NEAR_MATCH_MIN_OLD_STR_LENGTH = 10` is too low for auto-correct; short oldStrings misfire.

## Tasks (all in this milestone)

### Fix A — Tighten the 0.80 adaptive auto-correct branch
File: `packages/agent-runtime/src/process-str-replace.ts`, function `tryNearMatchAutoCorrect`.
- DELETE the `else if (best.similarity >= 0.80)` adaptive branch. Keep ONLY the strict `>= NEAR_MATCH_MIN_SIMILARITY` (0.92) path with its existing margin + runner-up gates. The 0.80 branch had no ambiguity proof and is the direct corruption source.
- Net: any oldString below 0.92 similarity falls through to the rich diagnostic error (re-read guidance + candidate ranges), which is the safe behavior.

### Fix B — Delimiter-balance check on near-match results
File: `packages/agent-runtime/src/process-str-replace.ts`.
- Add a helper `isResultDelimiterBalanced(initialContent, oldStr, newStr)` that computes brace/paren/bracket delta on the *resulting* content (initialContent with oldStr→newStr applied at the matched location) and rejects when the delta is non-zero.
- Call it inside `tryNearMatchAutoCorrect` right before the `occurrences !== 1` return. On failure, return `null` (fall through to the rich diagnostic path) and emit a debug log.
- Cheap, language-agnostic, defense-in-depth. Intentionally permissive about quotes/backticks (only structural brackets).

### Fix C — Per-path consecutive-failure circuit breaker
File: `packages/agent-runtime/src/tools/handlers/tool/str-replace.ts`.
- Extend `FileProcessingState` (in `write-file.ts`) with `consecutiveStrReplaceFailuresByPath: Record<string, number>`.
- In `handleStrReplace`, at the top (after computing `path`), if `consecutiveStrReplaceFailuresByPath[path] >= 2`, return a hard `errorMessage`: "Multiple consecutive str_replace failures on `<path>`. Stop retrying str_replace. Use `rewrite_symbol` (whole-symbol) or `write_file` (whole-file) instead, or re-read the exact range with read_files and retry once."
- Increment the counter when `processStrReplace` returns `error` OR when the result `messages` include the near-match auto-correct note (a misfire proxy). Reset to 0 on a clean success with no auto-correct note.
- A successful `basedOnRead`-anchored read also resets the counter (the agent has re-read).

### Fix D — Sharpen malformed-arg schema-edge errors
File: `packages/agent-runtime/src/tools/tool-executor.ts`, function `getToolValidationHint`.
- Extend the `str_replace`/`propose_str_replace` hint to enumerate the boolean `atomic`, the token-or-object `basedOnRead`, and the integer `occurrenceIndex` shapes explicitly, so a type mismatch yields a one-line correct-shape hint rather than raw Zod.
- Add `edit_transaction` and `write_file` hints for the same fields where relevant.

### Fix E — Raise min oldString length for auto-correct
File: `packages/agent-runtime/src/process-str-replace.ts`.
- Add `NEAR_MATCH_AUTOCORRECT_MIN_OLD_STR_LENGTH = 30` (keeps `NEAR_MATCH_MIN_OLD_STR_LENGTH = 10` for the diagnostic path).
- In `tryNearMatchAutoCorrect`, gate on the new higher threshold.

## Tests
File: `packages/agent-runtime/src/__tests__/process-str-replace.test.ts` (and a new `str-replace-circuit-breaker.test.ts` for Fix C).
- A: assert that a 0.84-similarity oldString (previously auto-corrected) now produces an `error` result with re-read guidance, not a content result.
- B: assert that a near-match whose newString would unbalance braces falls through to the error path.
- C: assert that after 2 consecutive failures on a path, the handler returns the circuit-breaker errorMessage.
- E: assert that a 15-char oldString that previously auto-corrected now falls through to diagnostics.

## Validation
- `bun run --cwd=packages/agent-runtime typecheck`
- `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts`
- `bun test packages/agent-runtime/src/__tests__/str-replace-circuit-breaker.test.ts`
- `bun run typecheck` (workspace-wide, to catch downstream consumers of FileProcessingState)

## Non-goals
- Renaming `creditsUsed` or other cross-cutting refactors.
- Changing the strict 0.92 path behavior (it already has correct gates).
- Touching `apply_patch` / `apply_smart_patch` fuzzy alignment (separate system).
- Prompt-level changes to base2/editor agents.