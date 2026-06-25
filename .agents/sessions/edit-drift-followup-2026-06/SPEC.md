# Edit-drift followup — SPEC

## Background
The `str-replace-hardening-2026-06` session shipped five fixes (A–E) for cascading-corruption in `str_replace`. A subsequent agent transcript revealed a *different* drift failure mode whose root trigger was NOT covered by those fixes. This followup closes the two remaining gaps.

## Goal
Eliminate the two remaining edit-drift triggers so agents no longer enter stale-anchor retry spirals after a `rewrite_symbol` call or on large files.

## Non-goals
- Re-opening the completed `str-replace-hardening-2026-06` fixes (A–E stay as-is).
- Renaming the legacy `creditsUsed` session-state field.
- Changing `str_replace`'s core matching/auto-correct thresholds further.
- Touching process-level delegation behavior (Gap #5 from the transcript analysis — out of scope, not a harness bug).

## Requirements

### Gap #1 — `rewrite_symbol` orphan doc-block (root trigger)
**Problem:** `handleRewriteSymbol` resolves the symbol's AST range via `getFileStructure`, which returns `[startLine, endLine]` for the symbol node only — it does NOT include the immediately-preceding JSDoc/comment block. When the symbol is replaced, the old doc-block remains and the new `content`'s own doc-block is inserted after it, producing a duplicate comment block. This shifts every subsequent line number and invalidates cached anchors, causing the cascade observed in the transcript.

**Fix:** Extend the resolved replacement range upward to include the immediately-preceding contiguous comment block (JSDoc `/** ... */`, block `/* ... */`, or consecutive line comments `//`) when one directly precedes the symbol with no blank line gap. The doc-block must be atomically replaced together with the symbol so there is no orphan and no duplicate.

**Acceptance criteria:**
- When a symbol is preceded by a JSDoc/block/line-comment block, `rewrite_symbol` includes that block in the replaced range.
- When a symbol is NOT preceded by a comment block, behavior is unchanged.
- The replaced `oldString` fed to `str_replace` must include the doc-block text so the match is unique and the doc-block is removed.
- Regression test: a symbol with a preceding JSDoc, rewritten with new content that also has a JSDoc, must NOT leave a duplicate doc-block in the output patch.
- Regression test: a symbol with NO preceding comment block must still rewrite cleanly (range unchanged).

### Gap #3 — stale-anchor drift on large files (partial)
**Problem:** On files >1000 lines, `str_replace` requires `basedOnRead`. When the anchor is stale (content hash mismatch from intervening edits), the edit is rejected with a generic message and the agent loops re-reading. Fix C trips after 3 failures, but nothing auto-recovers a single stale anchor.

**Fix:** When `basedOnRead` fails capability validation (stale hash / shifted range), and the `oldString` can be found uniquely in the current working-tree content, return a sharper recovery hint that includes the *actual current* line range and a fresh capability token minted from current content — so the agent can retry immediately on the next turn without a separate `read_files` round-trip. This is a hint-only enhancement; the edit is still rejected for safety (no silent auto-apply).

**Acceptance criteria:**
- A stale `basedOnRead` whose `oldString` is found uniquely in current content returns a recovery message containing the current `[startLine-endLine]` and a fresh `cap.` token.
- A stale `basedOnRead` whose `oldString` is NOT found uniquely returns the existing generic rejection (unchanged).
- Behavior on small files (<1000 lines, no `basedOnRead` required) is unchanged.
- Regression test: simulate a stale hash and unique oldString; assert the returned error message contains the fresh capability token and current line range.

## Systems touched
- `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts` (Gap #1)
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts` or a shared helper (Gap #1 doc-block detection may live in structural-read or a new small helper)
- `packages/agent-runtime/src/process-str-replace.ts` (Gap #3 hint enrichment)
- `packages/agent-runtime/src/structural-read.ts` (Gap #1 range extension source)
- Tests: `packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts`, `packages/agent-runtime/src/__tests__/process-str-replace.test.ts`

## Validation
- `bun run --cwd=packages/agent-runtime typecheck`
- `bun test packages/agent-runtime/src/__tests__/rewrite-symbol.test.ts`
- `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts`
- `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/str-replace-circuit-breaker.test.ts`
