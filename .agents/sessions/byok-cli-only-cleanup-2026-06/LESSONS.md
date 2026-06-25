# LESSONS — BYOK-only CLI/SDK cleanup

## Decisions
- Openbuff product scope is CLI/SDK local BYOK.
- Hosted web, billing, credits, subscriptions, freebuff, hosted dashboard, and product OAuth login are out of scope unless proven necessary for CLI/SDK development.
- Provider-owned OAuth/subscription access, such as ChatGPT/OpenAI subscription-style model access, must be preserved.
- Compatibility names such as `@codebuff/*`, `CodebuffClient`, `CODEBUFF_*`, `codebuff.json`, and `codebuff --local` may remain only as explicit legacy compatibility surfaces.

## Gotchas
- The worktree is already large before this cleanup. The rollback checkpoint must be committed before source cleanup so deletions and rewrites can be reverted independently.
- Updating STATUS.md with the checkpoint hash after committing will create a small post-checkpoint plan-artifact change unless recorded in a follow-up commit.

## Follow-up notes
- During inventory, verify imports before deleting large directories; do not assume `web/` or hosted packages are unreferenced without checking root scripts, package references, and TypeScript project references.

<!-- update_plan_status:appended -->
## Deleted-surface scan allowlist — 2026-06-21T16:21:37.913Z

For Milestone 2 deleted-surface scans, historical DB migration snapshot metadata such as `packages/internal/src/db/migrations/meta/0052_snapshot.json` may still contain legacy enum/type names (for example `freebuff_access_tier`). Treat those as non-actionable unless retained runtime code imports or depends on them. Generic provider benchmark prompts may mention technologies like BigQuery/Stripe as synthetic workload text and should not be treated as deleted Openbuff hosted-surface references.

<!-- update_plan_status:appended -->
## Scripts package typecheck module markers — 2026-06-21T16:32:40.943Z

The `scripts` package typecheck includes many standalone executable `.ts` files in one TypeScript program. Retained scripts with top-level `main()` and no imports/exports can collide as global scripts. Follow the existing convention of adding `export {}` near the shebang to force module scope when a standalone script has no imports/exports.


<!-- update_plan_status:appended -->
## Deleted-surface re-scan scope — 2026-06-21T17:10:58.418Z

For the post-cleanup re-scan, treat `freebuff_instance_id` as a stale active-source example if it appears in retained source/tests/docs; current scan found zero retained matches. Stripe/billing words in synthetic provider benchmark prompts and retained DB schema/migration metadata are not Milestone 2 blockers, but active CLI/SDK product-credit UX remains a later Milestone 3/4 concern.


<!-- update_plan_status:appended -->
## Milestone 4 cost-accounting scope — 2026-06-21T18:19:58.546Z

For SDK/provider cleanup, the safe milestone boundary is to remove Openbuff-hosted credit/markup assumptions while preserving provider cost accounting needed for BYOK providers. ChatGPT/Codex OAuth/subscription wording is provider-owned and explicitly allowed. The shared `creditsUsed` session-state/runtime field remains a legacy runtime metric name used across agent-runtime/evals/CLI display; renaming it should be handled as a separate cross-cutting refactor with focused tests rather than inside the SDK/provider cleanup milestone.


<!-- update_plan_status:appended -->
## Milestone 5 wording guard scope — 2026-06-21T19:07:08.118Z

When scanning markdown for forbidden hosted-product wording, exclude dependency/build/deleted-surface directories such as `node_modules/`, `web/`, `packages/billing/`, `packages/bigquery/`, `.agents/sessions/`, `dist/`, `build/`, `.next/`, and `coverage/`. Retained legacy knowledge files should explicitly state they are legacy/non-active Openbuff scope rather than carrying bare Stripe/billing/database guidance.


<!-- update_plan_status:appended -->
## Permanent BYOK wording guardrail — 2026-06-21T19:11:24.645Z

The durable guardrail lives in `scripts/byok-wording-guard.ts` and is covered by `scripts/__tests__/byok-wording-guard.test.ts`. It scans retained markdown/MDX only, skips dependency/build/deleted hosted directories, and allowlists explicit BYOK-negative statements, provider-owned flows, and legacy/upstream migration notes. Use `bun run --cwd=scripts guard:byok-wording` for a direct check.


<!-- update_plan_status:appended -->
## Final validation sequence — 2026-06-21T19:16:16.119Z

For this cleanup, the reliable final gate order was: independent checks in parallel (`bun run typecheck`, full CLI tests, BYOK wording guard, focused touched tests), then sequential generated/binary rebuilds (`cli prebuild:agents`, `cli build:binary`), then final CLI typecheck. The CLI binary rebuild copies `tree-sitter.wasm` into `cli/bin/` as part of normal output.


<!-- update_plan_status:appended -->
## Reviewer follow-up — 2026-06-21T19:19:22.600Z

The BYOK wording guard uses only `readdirSync` and `readFileSync` from `node:fs`; avoid carrying unused filesystem imports because scripts package typecheck/lint expectations may flag them.


<!-- update_plan_status:appended -->
## create_plan must force next step in plan mode — 2026-06-21T19:48:00.000Z — 2026-06-22T23:40:24.862Z

For plan-mode agents, `create_plan` must NOT be in `TOOLS_WHICH_WONT_FORCE_NEXT_STEP`. Including it caused the agent to end its turn after writing the first durable artifact, so plan mode would stop after one file (commonly SPEC.md) instead of producing the full SPEC.md / PLAN.md / STATUS.md / LESSONS.md packet. A successful `create_plan` is real artifact work and should force another model step so the agent can continue with the remaining companion artifacts. Removing `create_plan` from that allowlist in `common/src/tools/constants.ts` fixes the stop-after-first-artifact behavior; the constant is consumed in `packages/agent-runtime/src/run-agent-step.ts`. Validation: `bun --cwd=common run typecheck`, `bun test packages/agent-runtime/src/__tests__/run-programmatic-step.test.ts`, and `bun --cwd=cli run build:binary` all passed after the change; reviewer returned LOOKS_GOOD.

When auditing the runtime for similar stop-after-one-tool bugs, also re-check that other whole-artifact writing tools used by plan/execute flows are not in `TOOLS_WHICH_WONT_FORCE_NEXT_STEP` unless intentionally fire-and-forget.


<!-- update_plan_status:appended -->
## str_replace basedOnRead shape — 2026-06-21T19:43:17.717Z — 2026-06-22T23:43:57.442Z

For the `str_replace` tool with strict read-before-edit, `basedOnRead` must be passed as an object with `startLine`, `endLine`, and `hash` (decoded from the `readCapability` of the matching `read_files` range). A plain string capability is wrapped by the transport into `{"$text": "..."}` and rejected as `expected: string, received: object`. The form `{"startLine": 45, "endLine": 75, "hash": "<hex-no-scheme>"}` is accepted and the tool reports `basedOnRead was ignored` for sub-1,000-line files (small files are matched by exact `oldString`).

