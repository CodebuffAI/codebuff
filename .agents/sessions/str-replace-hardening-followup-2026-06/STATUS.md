# str_replace hardening follow-up — STATUS

## Current state
All planned work is complete and validated. Session is active pending the
final reviewer gate.

## Milestone checklist
- [x] M1 (Gap #1) — rewrite_symbol orphan JSDoc: `extendRangeToPrecedingComment`
      helper added in `structural-read.ts` and wired into `rewrite-symbol.ts`;
      unit + integration tests added.
- [x] M2 (Gap #3) — stale-anchor fresh token: `validateReadCapability` in
      `process-str-replace.ts` now mints a fresh `readCapability=cap.…` token for
      the current content of the same line range and embeds it in the rejection
      message; regression test added.
- [x] M3 — typecheck + focused tests pass; STATUS.md/LESSONS.md reconciled.

## Validation log
- `bun run --cwd=packages/agent-runtime typecheck` → exit 0 (after fixing a JSDoc
  self-termination bug in the `extendRangeToPrecedingComment` doc comment).
- `bun test structural-read.test.ts rewrite-symbol.test.ts process-str-replace.test.ts`
  → 85 pass / 0 fail / 287 expect() calls (after fixing two test assertions:
  the rewrite_symbol integration test over-captured on an internal hook, and the
  stale-anchor test over-asserted that the stale hash was absent).

## Next checkpoint
Reviewer gate on the pending changed files. No further implementation work
expected unless the reviewer returns BLOCKING.