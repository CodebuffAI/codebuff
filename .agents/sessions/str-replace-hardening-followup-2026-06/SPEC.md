# str_replace hardening follow-up — SPEC

## Goal
Close the two remaining gaps surfaced by the transcript analysis of a real
agent str_replace retry spiral on a large file:

1. **Gap #1 — rewrite_symbol orphan JSDoc (root trigger):** `rewrite_symbol`
   resolved a symbol's AST range and used that range as `oldString`, but the
   range excluded the preceding JSDoc/comment block. When the agent supplied a
   new `content` that included its own doc block, the old doc block was left
   orphaned and the new one duplicated it. The extra lines shifted every
   subsequent line number and invalidated cached anchors, causing the cascade of
   stale-anchor str_replace failures seen in the transcript.

2. **Gap #3 — stale-anchor re-derive cost (partial fix from prior session):**
   When a large-file str_replace rejected a stale `basedOnRead` anchor, the
   agent was told to re-read and "retry with the new rangeHash" but had to
   hand-derive the new hash/token from the fresh read output before it could
   retry. This added a fragile manual step to the recovery path.

## Non-goals
- Do NOT change `rewrite_symbol`'s symbol-resolution algorithm; only extend the
  replacement range to include a contiguous preceding comment block.
- Do NOT touch the adaptive auto-correct branches (already fixed in the prior
  `str-replace-hardening-2026-06` session: Fix A removed the sub-0.92 branch,
  Fix E raised the floor, Fix B added `isResultDelimiterBalanced`).
- Do NOT rename `creditsUsed` or other cross-cutting runtime fields.

## Requirements / acceptance criteria
- [x] `extendRangeToPrecedingComment(lines, startLine)` helper exists in
      `packages/agent-runtime/src/structural-read.ts` and is unit-tested.
- [x] `rewrite_symbol` uses the helper to extend `oldString` + `basedOnRead`
      upward to include a contiguous preceding JSDoc/block/line comment block.
- [x] No blank-line gap between comment block and symbol → no extension.
- [x] Gap #3: stale `basedOnRead` rejection in `processStrReplace` mints a fresh
      `readCapability=cap.…` token for the current content of the same line
      range and embeds it in the rejection message.
- [x] `bun run --cwd=packages/agent-runtime typecheck` exits 0.
- [x] Focused tests pass: structural-read.test.ts, rewrite-symbol.test.ts,
      process-str-replace.test.ts (85 pass / 0 fail / 287 expect() calls).