# str_replace hardening follow-up — PLAN

## Tasks (all complete)
- [x] **M1 (Gap #1)** Add `extendRangeToPrecedingComment(lines, startLine)` helper
      to `packages/agent-runtime/src/structural-read.ts` (JSDoc `/** ... */`,
      block `/* ... */`, and contiguous `//` line comments; stops at first blank
      line or non-comment line; no extension when there is a blank-line gap).
- [x] **M1 (Gap #1)** Wire the helper into
      `packages/agent-runtime/src/tools/handlers/tool/rewrite-symbol.ts` so the
      oldString + basedOnRead range both extend upward to the doc-block start.
- [x] **M1 (Gap #1)** Add unit tests for `extendRangeToPrecedingComment` in
      `packages/agent-runtime/src/__tests__/structural-read.test.ts` and an
      integration test in `rewrite-symbol.test.ts`.
- [x] **M2 (Gap #3)** Enrich the stale `basedOnRead` rejection in
      `packages/agent-runtime/src/process-str-replace.ts` `validateReadCapability`
      to mint a fresh `readCapability=cap.…` token for the current content of the
      same line range and embed it in the rejection message.
- [x] **M2 (Gap #3)** Add a regression test in
      `packages/agent-runtime/src/__tests__/process-str-replace.test.ts`
      asserting the fresh token + current hash appear in the stale-anchor error.
- [x] **M3** Run typecheck + focused tests; reconcile STATUS.md/LESSONS.md.

## Validation gates
- `bun run --cwd=packages/agent-runtime typecheck` → exit 0.
- `bun test structural-read.test.ts rewrite-symbol.test.ts process-str-replace.test.ts`
  → 85 pass / 0 fail / 287 expect() calls.