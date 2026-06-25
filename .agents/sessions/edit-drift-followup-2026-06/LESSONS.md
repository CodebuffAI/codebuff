# Edit-drift followup — LESSONS

## Origin
Spawned from the `str-replace-hardening-2026-06` session's post-completion analysis of an agent transcript. The five shipped fixes (A–E) addressed cascading-corruption in `str_replace`, but a separate transcript revealed two remaining drift triggers that were not in that session's scope.

## Decisions made during planning
- Treat Gap #1 (rewrite_symbol orphan doc-block) as the root trigger of the transcript's cascade; fixing it removes the most common way agents enter stale-anchor loops after a structural edit.
- Treat Gap #3 (stale-anchor recovery hint) as a hint-only enhancement, not an auto-apply. Silent auto-apply would undermine the strict-read-before-edit invariant that Fix A established.
- Keep the two fixes in one session because they share the same drift-recovery theme and the same validation surface (agent-runtime typecheck + focused tests).

## Root cause: Gap #1
`handleRewriteSymbol` resolves the symbol range from `getFileStructure`/`extractSlices`, which return `[startLine, endLine]` for the symbol AST node only. The immediately-preceding JSDoc/block/line-comment is NOT included. When the symbol text is replaced via str_replace, the old doc-block remains and the new `content`'s own doc-block lands after it → duplicate comment block → line shift → every cached anchor invalid → cascade.

## Root cause: Gap #3
`processStrReplace` rejects stale `basedOnRead` capability tokens (hash mismatch) with a generic message. The agent must separately `read_files` to mint a fresh anchor before retrying, which is a round-trip that invites drift on large files.

## Risks / gotchas to remember
- The doc-block extension must be conservative: only grab a comment block immediately contiguous (no blank-line gap) to avoid swallowing unrelated preceding comments.
- For line-comment runs, stop at the first blank line.
- The stale-anchor hint must NEVER auto-apply; it only enriches the rejection message.
- `mintSliceCapability` signature must accept the adjusted startLine without breaking existing callers.

## Follow-up notes
- (To be appended during execution.)
