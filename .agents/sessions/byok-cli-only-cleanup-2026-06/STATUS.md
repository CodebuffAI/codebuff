# STATUS — BYOK-only CLI/SDK cleanup

## Current state
- Phase: executing Milestone 0 — rollback checkpoint.
- Source cleanup edits: not started.
- Required next action: commit the current worktree as a rollback checkpoint before any cleanup edits.

## Milestone checklist
- [x] Milestone 0 — Rollback checkpoint (checkpoint commit 03cb53dc0a314c2a7a01a30d08472d45015481cd)
  - [x] Verify current git status and staged state. (verified before checkpoint commit)
  - [x] Commit the current worktree before cleanup edits. (03cb53dc0a314c2a7a01a30d08472d45015481cd)
  - [x] Record checkpoint commit hash here. (03cb53dc0a314c2a7a01a30d08472d45015481cd)
- [x] Milestone 1 — Dependency and surface inventory (inventory complete; web/billing/bigquery/freebuff/hosted scripts removable; packages/internal retained temporarily for SDK provider helpers)
- [x] Milestone 2 — Remove hosted product surfaces (hosted web/billing/bigquery/free-mode surfaces removed; active-source deleted-surface scan clean except historical DB migration snapshot metadata; validation pending) (hosted surfaces removed; deleted-surface scan clean except historical DB migration metadata; focused validation passed)
- [x] Milestone 3 — CLI hosted-credit cleanup (source/test/docs artifacts updated; validation pending) (validation passed: CLI typecheck, focused tests, full CLI tests)
- [x] Milestone 4 — SDK/provider cleanup (source patch applied; validation pending) (validation passed: SDK typecheck, root typecheck, focused SDK/provider tests, focused agent-runtime test)
- [x] Milestone 5 — Documentation and agent prompt invariant (documentation/agent prompt invariant complete; focused wording guard and root typecheck passed)
- [x] Milestone 6 — Static guardrails (static BYOK wording guardrail added and validated)
- [x] Milestone 7 — Rebuild and final validation (rebuild and final validation passed)

## Validation log
- No cleanup validation has run yet.

## Checkpoint commit
- Pending.

## Resume instructions
1. Continue at the first unchecked milestone above.
2. Do not start cleanup edits until Milestone 0 is complete.
3. After each milestone, update this file with current status, validation results, and next checkpoint.

<!-- update_plan_status:appended -->
## Checkpoint commit — 2026-06-21T14:23:12.990Z

Rollback checkpoint commit created before cleanup edits: `03cb53dc0a314c2a7a01a30d08472d45015481cd` (`chore: checkpoint before byok cleanup`). Note: this STATUS.md update occurs after the checkpoint and will be part of the cleanup worktree unless committed separately later.

<!-- update_plan_status:appended -->
## Milestone 1 inventory — 2026-06-21T14:29:31.670Z

Retain: `cli/`, `sdk/`, `common/`, `agents/`, `packages/agent-runtime/`, `packages/code-map/`, `packages/indexer/`, `packages/build-tools/`, local provider config, and ChatGPT/Codex provider-owned OAuth. Remove candidates confirmed: `web/`, `packages/billing/`, `packages/bigquery/`, root web/db/studio/freebuff scripts, hosted billing/credit/usage scripts, hosted web CI jobs. Do not delete `packages/internal` yet: SDK imports `@codebuff/internal/openai-compatible/index` and `@codebuff/internal/openrouter-ai-sdk`, so provider helpers must be moved or retained before internal package removal.


<!-- update_plan_status:appended -->
## Milestone 2 cleanup scan — 2026-06-21T16:21:18.941Z

Re-ran the narrowed active-source scan for deleted hosted surfaces (`freebuff`/`Freebuff`/`FREEBUFF_`/`web/src` plus removed hosted script/package paths). Actionable retained-source hits were patched to neutral Openbuff/BYOK examples. Remaining hits are limited to historical `packages/internal/src/db/migrations/meta/0052_snapshot.json` metadata (`freebuff_access_tier`), which is not an active source dependency for this milestone. Next: run focused validation for touched scripts/config/tests and address failures.


<!-- update_plan_status:appended -->
## Validation failure — 2026-06-21T16:26:19.479Z

Focused validation ran after Milestone 2 cleanup. `bun install` succeeded and targeted tests passed. `bun run typecheck` / `bun run --cwd=scripts typecheck` failed with duplicate top-level function implementations in `scripts/fireworks-deployment-stats.ts` and `scripts/test-openai-token-count.ts`; next action is a minimal script-module-scope fix and rerun the same validation.


<!-- update_plan_status:appended -->
## Milestone 2 validation passed — 2026-06-21T16:32:40.936Z

Validation after the script module-marker fix passed: `bun install` updated `bun.lock`; `bun run --cwd=scripts typecheck` passed; `bun run typecheck` passed; targeted tests for edited retained common/agent-runtime/sdk/cli test files passed. The previous duplicate `main()` script typecheck failure was fixed by adding the existing `export {}` module marker pattern to `scripts/fireworks-deployment-stats.ts` and `scripts/test-openai-token-count.ts`.


<!-- update_plan_status:appended -->
## Milestone 2 re-scan update — 2026-06-21T17:10:58.416Z

Re-scanned active retained source/config/docs for actionable references to deleted hosted surfaces after cleanup. No remaining actionable retained references were found for deleted `web/`, `packages/billing`, `packages/bigquery`, removed hosted scripts, `freebuff_instance_id`, or Freebuff/free-mode product flows in the Milestone 2 scope. Remaining matches are either historical DB schema/migration metadata, provider benchmark prompt text, or broader billing/credit surfaces reserved for later milestones. Next: run focused validation for the touched scripts/config/docs set and address any failures.


<!-- update_plan_status:appended -->
## Focused validation passed — 2026-06-21T17:12:46.249Z

Focused validation after the deleted-surface re-scan passed: `bun run --cwd=scripts typecheck` passed; `bun run typecheck` passed across the workspace; targeted tests passed for touched runtime/common/sdk/cli files (`packages/agent-runtime/src/__tests__/tool-validation-error.test.ts`, `common/src/util/__tests__/error-api-details.test.ts`, `sdk/src/impl/__tests__/provider-options-metadata.test.ts`, `sdk/src/__tests__/run-cancellation.test.ts`, `cli/src/hooks/helpers/__tests__/send-message.test.ts`, `cli/src/__tests__/release/proxy-http-get.test.ts`, `cli/src/__tests__/test-utils.ts`). Next checkpoint: Milestone 3 — CLI hosted-credit cleanup.


<!-- update_plan_status:appended -->
## Milestone 3 source cleanup — 2026-06-21T17:59:10.713Z

Removed CLI-hosted product credit/subscription UI and polling surfaces from active CLI code. Deleted obsolete hosted usage/subscription/out-of-credits banner, query, monitor, subscription-helper, preference-update, and dedicated usage-banner-state test files. Updated CLI tests/docs and harness copy to avoid Openbuff product-credit/subscription flows while preserving provider-owned OAuth/subscription wording such as ChatGPT connect/OAuth. Verification scan found zero active CLI matches for removed hosted-credit artifacts (`outOfCredits`, `subscriptionLimit`, usage/subscription query hooks, usage-banner-state, open-buy-credits, sessionCreditsUsed). Next: run focused CLI validation and record results.


<!-- update_plan_status:appended -->
## Milestone 3 validation passed — 2026-06-21T18:01:21.576Z

Milestone 3 validation passed. Commands run: `bun run --cwd=cli typecheck` (passed), focused affected CLI tests for send-message, feedback helpers, suggestion/activity queries, keyboard actions, error handling, send-message helpers, and message-block completion (passed), and `bun run --cwd=cli test` (passed; tmux/perf tests remained skipped as expected when tmux-specific integration tests are disabled). Next checkpoint: Milestone 4 — SDK/provider cleanup.


<!-- update_plan_status:appended -->
## Milestone 4 source cleanup — 2026-06-21T18:19:42.160Z

Applied focused SDK/provider cleanup for local/BYOK mode. Removed Openbuff-hosted credit/markup accounting assumptions from provider cost metadata handling, renamed/reworded the SDK helper to provider cost cents, removed unused hosted-credit pricing constants, and reworded shared callback parameter names/comments where they now represent provider cost cents. Preserved provider-owned ChatGPT/Codex OAuth/subscription flows and intentionally deferred broad `creditsUsed` session-state field renames to avoid a cross-cutting runtime/evals refactor in this milestone. Verification scan found no remaining active matches for Openbuff product-credit/markup/hosted billing helper patterns in retained source.


<!-- update_plan_status:appended -->
## Milestone 4 validation passed — 2026-06-21T18:23:26.180Z

Milestone 4 validation passed. Commands run: `bun run --cwd=sdk typecheck` (passed), `bun run typecheck` (passed across workspace), focused SDK/provider tests (`sdk/src/impl/__tests__/provider-options-metadata.test.ts`, `sdk/src/__tests__/model-provider.test.ts`, `sdk/src/__tests__/run-cancellation.test.ts`) passed, and focused agent-runtime test (`packages/agent-runtime/src/__tests__/tool-validation-error.test.ts`) passed. Next checkpoint: Milestone 5 — Documentation and agent prompt invariant.


<!-- update_plan_status:appended -->
## Milestone 5 validation passed — 2026-06-21T19:07:08.115Z

Milestone 5 documentation and agent-facing wording validation passed. Commands run: focused BYOK wording guard over retained markdown/MDX surfaces excluding dependency/build/deleted hosted directories (passed), and `bun run typecheck` across the workspace (passed). Also patched `packages/internal/src/db/schema.knowledge.md` to mark legacy hosted database notes as non-active Openbuff scope and remove stale direct Stripe guidance.


<!-- update_plan_status:appended -->
## Milestone 6 validation passed — 2026-06-21T19:11:24.644Z

Added permanent BYOK hosted-product wording guardrail in `scripts/byok-wording-guard.ts`, a Bun test wrapper in `scripts/__tests__/byok-wording-guard.test.ts`, and direct package script `guard:byok-wording` in `scripts/package.json`. Validation passed: `bun run --cwd=scripts guard:byok-wording`, `bun test scripts/__tests__/byok-wording-guard.test.ts`, `bun run --cwd=scripts typecheck`, and `bun run typecheck`.


<!-- update_plan_status:appended -->
## Milestone 7 final validation passed — 2026-06-21T19:16:16.117Z

Final validation passed. Commands run: `bun run typecheck`; `bun run --cwd=cli test`; `bun run --cwd=scripts guard:byok-wording`; `bun test scripts/__tests__/byok-wording-guard.test.ts`; focused touched tests for CLI send-message/feedback/suggestion/activity, SDK provider/cancellation, agent-runtime tool validation, and common error API details; `bun run --cwd=cli prebuild:agents`; `bun run --cwd=cli build:binary`; and final `bun run --cwd=cli typecheck`. All commands exited successfully.


<!-- update_plan_status:appended -->
## Reviewer blocker resolved — 2026-06-21T19:19:22.598Z

Resolved the blocking reviewer feedback by removing the unused `statSync` import from `scripts/byok-wording-guard.ts`. Focused validation passed after the fix: `bun run --cwd=scripts guard:byok-wording`, `bun test scripts/__tests__/byok-wording-guard.test.ts`, and `bun run --cwd=scripts typecheck`.


<!-- update_plan_status:appended -->
## Reviewer gate cleared — 2026-06-21T19:43:17.717Z — 2026-06-22T23:43:57.436Z

Final reviewer gate cleared on the default-flow plan-artifacts / cli dependency change set. Both prior BLOCKING findings were applied:
- `common/src/util/__tests__/plan-artifacts.test.ts` three regex literals rewritten from `/only \.agents\/sessions\/\<slug\>\//` to `/only \.agents\/sessions\/<slug>\//` (unescaped `<`/`>`).
- `cli/package.json` `dependencies` now starts with `"@codebuff/common": "workspace:*"` (before `@codebuff/indexer`).

Validation: `cd common && bun test src/util/__tests__/plan-artifacts.test.ts` → 6 pass / 0 fail / 28 expect() calls (exit 0); `cd cli && bun run typecheck` → `tsc --noEmit -p .` exit 0 with no diagnostics. The code-reviewer re-invocation returned LOOKS_GOOD with no remaining findings.

