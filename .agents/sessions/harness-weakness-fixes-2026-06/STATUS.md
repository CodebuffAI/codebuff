# Harness Weakness Fixes — STATUS

## Current state
- Planning packet created in plan mode.
- Existing audit packet `.agents/sessions/harness-audit-2026-06/` was read and used as source context.
- Relevant source/test files were identified with query_index, file-picker, and code-searcher agents.
- Milestone 3 content hashing is complete: reviewer-gate durable fingerprints now include working-tree content markers in `agents/base2/base2.ts`.
- Replace-range stale-hash recovery is improved in `sdk/src/tools/replace-range.ts`: stale ranges still fail closed, but diagnostics now include checked span, file length, current hash, and exact re-read/retry guidance.
- Focused regression tests were added/updated in `agents/__tests__/base2.test.ts` and `sdk/src/__tests__/replace-range.test.ts`.
- Prior reviewer non-blocking cleanup was addressed: fingerprint helper comments clarify normalized/absolute path behavior, module loading was simplified, durable-pass test fixtures now share a helper, and release/build follow-up wording is explicit.
- Working tree still contains many unrelated modified/deleted/untracked files from prior work; future implementation must avoid treating the whole diff as belonging to this plan.
- Milestone 0 safety baseline is complete: current `git_status` and `.agents/sessions/harness-audit-2026-06/{SPEC,PLAN,STATUS,LESSONS}.md` were re-read before further source work.
- Milestone 1 is progressing in small behavior-preserving slices: typed active-work/gate state aliases were extracted to `agents/base2/gate-state.ts`, pure gate path/set helpers were extracted to `agents/base2/gate-paths.ts`, and reviewer verdict/blocker parsing helpers were extracted to `agents/base2/gate-reviewer.ts` with inline serialized mirrors still preserved in `handleSteps`.
- Milestone 2 read-before-edit enforcement is complete as a staged strict-mode runtime boundary: `FileProcessingState` can require prior `read_files` authorization, `str_replace` / `edit_transaction` block unread paths in strict mode, `basedOnRead` remains an explicit authorization path, and successful edits invalidate per-path authorization.
- Milestone 4 structured gate telemetry and skip diagnostics are complete: Base2 now emits best-effort structured gate telemetry, visible `<gate-state>` blocks for pass/fail/skip branches, and explicit disabled-gate skip diagnostics.
- Milestone 5 PlanLink auto-update wiring is complete: Base2 exposes `update_plan_status`, plan-mode and durable-plan command prompts prefer it for incremental `STATUS.md` / `LESSONS.md` updates, and generated agent tool type maps include the tool.
- Milestone 6 lifecycle E2E coverage is complete: deterministic Base2 generator-boundary tests cover validation failure recovery, reviewer blocking loops, final pass behavior, reviewer spawn conditions, disabled-gate skips, no-edit passes, and unsafe pending-file diagnostics.
- Milestone 7 documentation cleanup is complete: request flow, architecture, deterministic edit system, agent/tool, local-mode, and testing docs now describe the landed local/BYOK flow, gate/read-before-edit invariants, PlanLink wiring, and lifecycle coverage pointers.

## Completed
- Context gathered for all weaknesses identified in the audit.
- Durable plan artifacts created:
  - `SPEC.md`
  - `PLAN.md`
  - `STATUS.md`
  - `LESSONS.md`
- Milestone 3 content hashing — working-tree content hashes for reviewer-gate durable pass freshness.
- Replace-range stale diagnostics — actionable stale-range recovery guidance without auto-applying unsafe edits.
- Prior non-blocking reviewer cleanup for content-hash slice.
- Targeted validation: `bun test agents/__tests__/base2.test.ts` passed after fixing serialized built-in module loading for fingerprint hashing.
- Targeted validation: `bun test sdk/src/__tests__/replace-range.test.ts agents/__tests__/base2.test.ts` — pass.
- Replace-range polish slice — fixed off-by-one display line count, clamped truncated checked spans to human-visible lines, only mention checked span when truncated, narrowed filesystem catch to read failures with error code, extra regression test for truncated stale checks; `bun test sdk/src/__tests__/replace-range.test.ts` — pass.
- Follow-up replace_range guidance cleanup — stale diagnostics and tool description now tell agents to re-read with a visible `endLine` and avoid trailing phantom lines; `bun test sdk/src/__tests__/replace-range.test.ts` — pass.
- Milestone 1 first slice — extracted gate-state type aliases to `agents/base2/gate-state.ts`; `bun test agents/__tests__/base2.test.ts` — pass; `bunx tsc --noEmit` in `agents/` — pass.
- Milestone 1 gate-path slice — extracted pure path/set helpers to `agents/base2/gate-paths.ts`, added focused helper tests, and kept inline `handleSteps` mirrors for serialization safety; `bun test agents/__tests__/base2.test.ts` — pass; `bunx tsc --noEmit` in `agents/` — pass.
- Milestone 1 gate-reviewer slice — extracted reviewer verdict/blocker parsing helpers to `agents/base2/gate-reviewer.ts`, added focused helper tests plus inline-mirror drift coverage, and kept inline `handleSteps` mirrors for serialization safety; `bun test agents/__tests__/gate-reviewer.test.ts agents/__tests__/gate-paths.test.ts agents/__tests__/base2.test.ts` — pass; `bunx tsc --noEmit` in `agents/` — pass.
- Milestone 0 safety baseline and ownership split — current `git_status` and the audit packet were re-read; no source edits required.
- Milestone 2 staged read-before-edit enforcement — strict-mode registry/authorization checks added for runtime edit handlers; validation passed: `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`, `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts packages/agent-runtime/src/__tests__/process-edit-transaction.test.ts`, and `bunx tsc --noEmit` in `packages/agent-runtime/`.
- Milestone 4 structured gate telemetry and skip diagnostics — Base2 gate decisions now emit best-effort structured telemetry and user-visible gate-state blocks, including disabled-gate skips and unsafe no-pending-files failures; validation passed: `bun test agents/__tests__/base2.test.ts` and `bunx tsc --noEmit` in `agents/`.
- Milestone 5 PlanLink auto-update wiring — `update_plan_status` is exposed to Base2 and emphasized in plan/resume/update/lessons prompts for incremental status/lesson maintenance; generated agent tool type maps were updated; validation passed: `bun test agents/__tests__/base2.test.ts cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts`, `bunx tsc --noEmit` in `agents/`, `cli/`, and `common/`.
- Milestone 6 lifecycle E2E coverage — added deterministic generator-boundary tests in `agents/e2e/gate-lifecycle.e2e.test.ts` and `agents/e2e/reviewer-spawn-conditions.e2e.test.ts`; validation passed: `bun test agents/e2e/gate-lifecycle.e2e.test.ts agents/e2e/reviewer-spawn-conditions.e2e.test.ts agents/__tests__/base2.test.ts`; `bunx tsc --noEmit` in `agents/`.
- Milestone 7 documentation cleanup — updated `docs/request-flow.md`, `docs/architecture.md`, `docs/deterministic-edit-system.md`, `docs/agents-and-tools.md`, `docs/local-mode.md`, and `docs/testing.md`; validation passed: `bun run test:docs:integrity` in `web/`; `bunx prettier --check docs/request-flow.md docs/architecture.md docs/deterministic-edit-system.md docs/agents-and-tools.md docs/local-mode.md docs/testing.md`.

## Pending milestones
1. Milestone 0 — Safety baseline and ownership split — done.
2. Milestone 1 — Extract typed gate modules from `base2.ts` — partial: typed gate-state aliases extracted to `agents/base2/gate-state.ts`; pure gate path/set helpers extracted to `agents/base2/gate-paths.ts`; reviewer verdict/blocker parsing extracted to `agents/base2/gate-reviewer.ts`; inline serialized mirrors retained. Additional runtime helper extraction still todo and constrained by serialized-handleSteps test.
3. Milestone 2 — Runtime-enforce read-before-edit — complete as staged strict-mode runtime enforcement; default-compatible rollout preserved.
4. Milestone 3 — Upgrade reviewer fingerprints to working-tree content hashes — complete for content hashing and stale range recovery adjunct; extraction/telemetry polish belongs to later milestones or follow-up work.
5. Milestone 4 — Structured gate telemetry and skip diagnostics — done.
6. Milestone 5 — PlanLink auto-update for durable artifacts — done.
7. Milestone 6 — Lifecycle E2E coverage — done.
8. Milestone 7 — Documentation cleanup — done.

## Blocked
- None currently.

## Open questions for implementation
- Read-before-edit enforcement rollout decision: implemented behind staged strict mode first; immediate default-on blocking remains deferred until callers/agents are updated for strict behavior.
- Should parent-agent reads authorize editor-subagent edits, or must subagents always perform their own reads? Default recommendation: subagents should read their own target ranges unless a deliberate handoff capability design is added.
- Where should extracted gate modules live: `agents/base2/` for agent-local concerns or `packages/agent-runtime/src/` for runtime-owned invariants? Default recommendation: start in `agents/base2/`, move runtime-generic pieces later.
- How much validation identity should be included in reviewer fingerprints: status summary only, command/hook identity, or hook output hash? Default recommendation: hook identity + pass/fail summary + bounded output hash.
- Should PlanLink auto-updates be default-on for any `/resume-plan` session? Default recommendation: yes for task status lines, conservative append-only for lessons.

## Next checkpoint
All planned milestones in this packet are complete. Before any future follow-up, re-read current source/docs and `git_status`, isolate plan-owned files from the broader dirty working tree, and choose a new explicit milestone or session packet.

## Resume instructions
- Use `/resume-plan harness-weakness-fixes-2026-06` to continue.
- Treat this packet as the source of truth, but re-read current source files before editing because the working tree is active.
- Implement one milestone at a time.
- After each milestone:
  - update this STATUS.md with actual status and validation result;
  - update PLAN.md if the task list changes;
  - append decisions/gotchas to LESSONS.md.

## Validation history (recent first)
- M7 documentation cleanup: `bun run test:docs:integrity` in `web/` pass; `bunx prettier --check docs/request-flow.md docs/architecture.md docs/deterministic-edit-system.md docs/agents-and-tools.md docs/local-mode.md docs/testing.md` pass.
- M6 lifecycle E2E/integration coverage: `bun test agents/e2e/gate-lifecycle.e2e.test.ts agents/e2e/reviewer-spawn-conditions.e2e.test.ts agents/__tests__/base2.test.ts` pass; `bunx tsc --noEmit` in `agents/` pass.
- M5 PlanLink auto-update wiring: `bun test agents/__tests__/base2.test.ts cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts` pass; `bunx tsc --noEmit` in `agents/`, `cli/`, and `common/` pass.
- M4 structured gate telemetry/skip diagnostics: `bun test agents/__tests__/base2.test.ts` pass; `bunx tsc --noEmit` in `agents/` pass.
- M3 content fingerprint verification: `bun test agents/__tests__/base2.test.ts` pass; `bunx tsc --noEmit` in `agents/` pass.
- M2 staged read-before-edit enforcement: `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` pass; `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts packages/agent-runtime/src/__tests__/process-edit-transaction.test.ts` pass; `bunx tsc --noEmit` in `packages/agent-runtime/` pass.
- M0 safety baseline: bookkeeping-only; no source validation required.
- M1 gate-path helper extraction: `bun test agents/__tests__/base2.test.ts` pass; `bunx tsc --noEmit` (agents) clean.
- M1 slice — typed gate-state alias extraction: `bun test agents/__tests__/base2.test.ts` 36/36 pass; `bunx tsc --noEmit` (agents) clean.

- Planning-only request: no implementation validation run.
- First implementation slice: `bun test agents/__tests__/base2.test.ts` — pass.
- Stale range diagnostics / non-blocking cleanup slice: `bun test sdk/src/__tests__/replace-range.test.ts agents/__tests__/base2.test.ts` — pass.
- Replace-range polish slice: `bun test sdk/src/__tests__/replace-range.test.ts` — pass.
- Follow-up replace-range reviewer cleanup: `bun test sdk/src/__tests__/replace-range.test.ts` — pass.
- Follow-up replace_range guidance cleanup: `bun test sdk/src/__tests__/replace-range.test.ts` — pass.
