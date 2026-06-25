# str_replace hardening follow-up — LESSONS

## Decisions made during execution
- Scope the follow-up strictly to the two gaps the prior session did not close
  (Gap #1 rewrite_symbol orphan JSDoc, Gap #3 stale-anchor re-derive cost).
  Do not re-enter the auto-correct branches (Fixes A/B/E already shipped).
- Implement `extendRangeToPrecedingComment` in `structural-read.ts` (alongside
  `mintSliceCapability`) rather than inline in `rewrite-symbol.ts`, so the
  helper is unit-testable independent of the str_replace delegation plumbing.
- Have the stale-anchor rejection mint the fresh token for the *same* line
  range as the stale anchor, not a re-derived range. The agent still needs to
  re-read to confirm oldString, but once it has, it can retry with the embedded
  token without hand-deriving a new hash.

## Gotchas / root causes
- **JSDoc self-termination:** a doc comment that contains the literal `/** ...
  */` sequence (describing block-comment syntax) terminates the outer JSDoc
  early and breaks the surrounding TS. The `extendRangeToPrecedingComment` doc
  comment originally embedded `/** ... */` and `/* ... */` as illustrative
  text, which parsed as a real comment close. Replaced with a `//`-line comment
  block to avoid the `*/` terminator entirely.
- **Integration test over-capture:** the rewrite_symbol handler delegates to
  `handleStrReplace`, which does not route `replacements` through the
  `requestClientToolCall` hook the test was capturing on. An integration test
  asserting on captured internal `replacements` is therefore unreliable; the
  doc-block inclusion logic is better unit-tested directly on
  `extendRangeToPrecedingComment` in `structural-read.test.ts`. The
  `rewrite-symbol.test.ts` integration test was reduced to asserting the
  rewrite succeeds end-to-end with a preceding JSDoc present.
- **Stale-anchor error echoes the stale hash:** the rejection message includes
  "Expected <stale-hash> ... but current hash is <current-hash>". A test
  asserting `not.toContain(staleHash)` will fail because the stale hash
  legitimately appears in the diagnostic. The regression test now asserts only
  that the fresh token + current hash are present.

## Reusable findings
- `rewrite_symbol`'s AST symbol range intentionally excludes the preceding
  comment block; any tool that resolves a symbol range and uses it as an
  `oldString` must extend the range upward to include a contiguous preceding
  comment block, or it will orphan/duplicate doc blocks when the new content
  carries its own doc block.
- Recovery messages that require the agent to derive a new capability token by
  hand (re-hash the range, re-encode) are a fragile manual step. Whenever a
  deterministic rejection can mint a fresh token for the current content, it
  should embed that token so the agent can copy-paste it as `basedOnRead`.

## Follow-up notes
- If a future transcript shows a `rewrite_symbol` on a symbol whose preceding
  comment block has a blank-line gap before the symbol, the helper intentionally
  does not extend (no contiguous adjacency). Document this in the tool's
  user-facing doc if agents start relying on it.
- The `useAtomicBatch` dead-code branch in `getFieldSpecificHint` (finding #4
  from the prior session's reviewer) remains a cosmetic nit; defer to a future
  cleanup pass.