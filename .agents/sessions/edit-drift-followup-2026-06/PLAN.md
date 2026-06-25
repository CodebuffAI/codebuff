# Edit-drift followup — PLAN

## Goal
Eliminate the two remaining edit-drift triggers (Gaps #1 and #3) that the `str-replace-hardening-2026-06` fixes did not cover, as surfaced by the agent transcript analysis.

## Milestones
- [ ] M0 — Rollback checkpoint (commit current worktree)
- [ ] M1 — Gap #1: `rewrite_symbol` doc-block inclusion (source + tests)
- [ ] M2 — Gap #3: stale-anchor recovery hint enrichment (source + tests)
- [ ] M3 — Final validation + LESSONS capture

## M1 — Gap #1: `rewrite_symbol` orphan doc-block

### Root cause
`handleRewriteSymbol` (in `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts`) resolves the symbol range from `getFileStructure` / `extractSlices`. Both return `[startLine, endLine]` for the symbol AST node only, EXCLUDING the immediately-preceding comment/JSDoc block. When the symbol text is replaced via `str_replace`, the old doc-block stays in place, and the new `content`'s own leading doc-block lands directly after it → duplicate comment block → line-number shift → stale-anchor cascade.

### Fix
Extend the resolved replacement range UPWARD to include the contiguous immediately-preceding comment block.

**Location:** New helper `extendRangeToPrecedingComment(lines, startLine)` in `packages/agent-runtime/src/structural-read.ts` (near `mintSliceCapability`), plus wiring in `rewrite-symbol.ts`.

**Helper logic** (pseudo):
```
function extendRangeToPrecedingComment(lines: string[], startLine: number): { startLine: number; oldStringPrefix: string } {
  // Walk upward from (startLine - 1) over:
  //   - a contiguous `/** ... */` or `/* ... */` block ending on the line before startLine
  //   - or consecutive `// ...` line comments on the lines before startLine
  // Stop at the first blank line or non-comment line.
  // Return the adjusted startLine (inclusive of the comment block).
}
```

**Wiring in `rewrite-symbol.ts`:** For each match, before building `oldString`, call the helper to adjust `match.startLine` down to include the comment block, then slice `lines` from the adjusted start. The `mintSliceCapability` call must use the adjusted startLine so the capability token covers the full range.

### Acceptance tests (add to `rewrite-symbol.test.ts`)
1. Symbol with preceding JSDoc, rewritten with new content that ALSO has a JSDoc → output patch has exactly ONE doc-block (no duplicate).
2. Symbol with preceding JSDoc, rewritten with content that has NO doc-block → the old doc-block is removed (range included it).
3. Symbol with NO preceding comment block → range unchanged, behavior identical to current.
4. Symbol with preceding `//` line comments → comments included in range.

## M2 — Gap #3: stale-anchor recovery hint

### Root cause
`processStrReplace` validates `basedOnRead` capability tokens. On stale-hash mismatch it rejects with a generic message; the agent must separately `read_files` to get a fresh anchor before retrying, costing a round-trip and inviting drift.

### Fix
In the `basedOnRead` validation-failure branch of `processStrReplace` (where the capability token's hash doesn't match the current content), when the `oldString` is findable uniquely in the current working-tree content, enrich the rejection message with:
- the current `[startLine-endLine]` of the match, and
- a fresh capability token minted from current content (reuse `encodeReadCapabilityToken` + `getContentHash`).

The edit is still REJECTED (no silent apply). This is a hint-only enhancement.

**Location:** `packages/agent-runtime/src/process-str-replace.ts`, in the branch that currently emits the stale-capability rejection.

### Acceptance tests (add to `process-str-replace.test.ts`)
1. Stale `basedOnRead` hash + unique `oldString` in current content → returned error contains a fresh `cap.` token and the current `[L-L]` range.
2. Stale `basedOnRead` hash + `oldString` NOT in current content → existing generic rejection (unchanged).
3. Small file (<1000 lines, no `basedOnRead`) → behavior unchanged.

## M3 — Final validation
- `bun run --cwd=packages/agent-runtime typecheck`
- `bun test packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts`
- `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts`
- `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts`
- Append LESSONS.md with the two root-cause diagnoses and the doc-block detection heuristic.

## Risks
- The doc-block extension must be conservative: only grab a comment block that is immediately contiguous (no blank line gap) to avoid swallowing unrelated preceding comments.
- For line-comment runs, stop at the first blank line.
- The stale-anchor hint must never auto-apply; it only enriches the rejection message.
- `mintSliceCapability` signature must accept the adjusted startLine without breaking existing callers.
