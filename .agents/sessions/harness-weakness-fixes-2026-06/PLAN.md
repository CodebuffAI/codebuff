# Harness Weakness Fixes — PLAN

## Status legend
- todo — not started
- in-progress — actively being implemented
- blocked — waiting on a decision or prerequisite
- done — implemented and validated

## Milestone 0 — Safety baseline and ownership split
Status: done — current `git_status` and the existing audit packet were re-read; unrelated working-tree changes remain explicitly out of scope.

Purpose: establish a clean implementation baseline before touching central harness logic.

Tasks:
1. Run/read current `git_status` and identify unrelated modified files that must not be touched.
2. Re-read existing audit packet: `.agents/sessions/harness-audit-2026-06/{SPEC,PLAN,STATUS,LESSONS}.md`.
3. Confirm which weaknesses are already partially implemented in the current working tree and which remain follow-ups:
   - P0-1 read-before-edit runtime enforcement — deferred/todo.
   - P0-2 content fingerprint — baseline exists; full file-content hash todo.
   - P1-5 lifecycle E2E tests — todo.
   - P0-11 PlanLink auto-updates — explicit tool exists; automatic wiring todo.
   - P0-12 telemetry events/logs — pinned state exists; structured telemetry todo.
   - docs/request-flow cleanup — todo.
4. Choose one milestone at a time; do not combine P0-1 with the `base2.ts` refactor unless tests are already green.

Validation gate:
- No source edits in this milestone except optional plan artifact updates.

## Milestone 1 — Extract typed gate modules from `base2.ts`
Status: partial — typed state aliases extracted to `agents/base2/gate-state.ts`; pure path/set helpers extracted to `agents/base2/gate-paths.ts`; reviewer parsing helpers extracted to `agents/base2/gate-reviewer.ts`; inline serialized mirrors retained where `handleSteps` still requires them.

Purpose: reduce `base2.ts` complexity without changing behavior.

Tasks:
1. Read `agents/base2/base2.ts` outline and relevant symbols around:
   - `Base2ActiveWorkState` / active-work initialization.
   - `normalizeGateFilePath`, `normalizeGateFileList`, `gateFileSetsEqual`.
   - `hasDurableGatePassForPendingFiles`, `reviewerFinalizationVerdictFromDurablePass`.
   - `buildPinnedActiveWorkMessage`.
   - edit detection helpers near message-history scanning.
2. Create small helper modules under `agents/base2/` or a shared runtime location only after verifying local import conventions. Suggested split:
   - `gate-state.ts`: typed state aliases extracted; initialization, transition helpers, and `canFinalize` predicate still todo.
   - `gate-paths.ts`: path normalization and equality extracted; inline `handleSteps` mirrors retained until serialization boundary is redesigned.
   - `gate-reviewer.ts`: reviewer verdict parsing and blocker extraction extracted; inline `handleSteps` mirrors retained until serialization boundary is redesigned.
   - `gate-edit-detection.ts`: changed-file extraction from tool results/subagent output.
3. Move tests first or alongside extraction by extending `agents/__tests__/base2.test.ts` with behavior-preserving cases before altering logic.
4. Keep `base2.ts` as the orchestrator: it should call helpers, not own all helper internals.
5. Preserve pinned active-work state format until CLI/parser consumers are updated.

Validation gate:
- `bun test agents/__tests__/base2.test.ts agents/__tests__/context-pruner.test.ts agents/__tests__/code-reviewer.test.ts`
- `bun --cwd=agents tsc --noEmit`

Risks:
- Generated `cli/src/agents/bundled-agents.generated.ts` may need regeneration depending on repo workflow; verify existing build process before editing generated files.
- Moving exported symbols requires reference search before/after extraction.

## Milestone 2 — Runtime-enforce read-before-edit
Status: complete — staged strict-mode enforcement implemented in `FileProcessingState`; default remains compatible while strict mode blocks unread `str_replace` / `edit_transaction` paths and invalidates authorization after edits.
Depends on: Milestone 0; can run before or after Milestone 1 if scoped carefully.

Purpose: make the strongest prompt-only correctness rule deterministic.

Tasks:
1. Read current implementations:
   - `packages/agent-runtime/src/process-str-replace.ts`
   - `packages/agent-runtime/src/process-edit-transaction.ts`
   - `packages/agent-runtime/src/run-agent-step.ts`
   - `packages/agent-runtime/src/tools/handlers/tool/read-files.ts`
   - `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
   - `sdk/src/tools/read-files.ts`
2. Define a `ReadCapabilityRegistry` or equivalent per-agent-turn store with normalized path, line range, hash, source tool, and timestamp/turn id.
3. Mint/register read capabilities when `read_files` returns full-file, range, or symbol-slice reads. If `read_outline` does not include content sufficient for editing, do not count it as edit authorization unless a concrete capability is present.
4. Enforce in `str_replace` and `edit_transaction`:
   - Allow if `basedOnRead` is valid and covers the target region.
   - Allow if a fresh registered read covers the target region and deterministic matching can identify that region.
   - Allow new file creation through `write_file` when the path does not exist.
   - Allow configured/generated paths only via explicit allowlist, kept narrow and tested.
   - Reject otherwise with a structured error: read exact target file/range first, then retry.
5. Decide policy for small files: default should still require a prior read for overwrite/edit operations, even though stale `basedOnRead` may currently be ignored for some small-file deterministic matches. If this is too disruptive, introduce an opt-in feature flag first.
6. Ensure registry clears on turn boundary and after intervening edit invalidates stale capabilities for touched paths.
7. Add regression tests before broad rollout.

Validation gate:
- `bun test packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts`
- `bun test packages/agent-runtime/src/__tests__/process-str-replace.test.ts packages/agent-runtime/src/__tests__/process-edit-transaction.test.ts`
- `bun --cwd=packages/agent-runtime tsc --noEmit`

Risks:
- Too-strict enforcement may break current tests or agents that rely on unique-string edits after context-only discovery. Prefer staged rollout with clear errors.
- Parent-read capabilities must not be blindly reusable by editor subagents unless explicitly passed and still fresh; preserve the current editor guidance that children should read their own target ranges.

## Milestone 3 — Upgrade reviewer gate fingerprints to working-tree content hashes
Status: complete — durable reviewer-gate fingerprints include working-tree content markers and fail closed for older/no-fingerprint serialized state.
Depends on: Milestone 1 recommended, but can be implemented as a helper first.

Purpose: prevent stale reviewer approval after content changes to the same path.

Tasks:
1. Read current `buildGateFingerprint` and durable pass logic in `agents/base2/base2.ts`.
2. Create a helper such as `agents/base2/gate-fingerprint.ts` or `packages/agent-runtime/src/util/gate-fingerprint.ts` after confirming import boundaries.
3. Fingerprint should include:
   - normalized workspace-relative path list sorted deterministically.
   - for each existing file: working-tree content SHA-256, file size, and optionally mtime only for diagnostics, not identity.
   - deleted/missing marker for pending paths that no longer exist.
   - validation summary identity: configured hook result status plus relevant command/hook labels when available.
   - reviewer verdict type and maybe reviewer prompt/version identifier.
4. Do not rely on git index/status alone; hash actual working-tree content.
5. If content cannot be read, fail closed: no durable pass reuse and explicit skip/fingerprint error in active state.
6. Keep backward compatibility: older serialized state without fingerprint must not silently pass except under an intentionally limited migration fallback.
7. Add tests for unchanged content reuse, same path changed content invalidation, deleted file invalidation, validation summary change invalidation, and path normalization.

Validation gate:
- `bun test agents/__tests__/base2.test.ts`
- `bun --cwd=agents tsc --noEmit`

Risks:
- Hashing large files can add overhead. Keep hashing scoped to pending gate files only and cache within a turn if needed.

## Milestone 4 — Add structured gate telemetry and user-visible skip diagnostics
Status: done
Depends on: Milestone 1 helpful; Milestone 3 for fingerprint fields.

Purpose: make gate decisions observable and eliminate silent reviewer skips.

Tasks:
1. Define a small telemetry event shape:
   - `event: 'gate_decision' | 'reviewer_skip' | 'validation_result' | 'fingerprint_reuse'`
   - pending file count/list, normalized files, validation status, reviewer status, skip reason, fingerprint id/hash prefix, blocker count, current phase.
2. Emit telemetry/log entries at each gate decision in `base2.ts` or extracted gate module.
3. Preserve user-facing pinned state already implemented; add missing skip reasons if any remain.
4. Wire CLI gate-state block promotion if not already done: parse emitted `<gate-state>` blocks, scrub from prose, render `GateStateBox`.
5. Keep telemetry best-effort; failure to log must not block the agent loop.

Validation gate:
- `bun test agents/__tests__/base2.test.ts`
- `bun test cli/src/utils/__tests__/message-block-helpers.test.ts` if CLI parsing changes.
- `bun --cwd=cli tsc --noEmit` if CLI types/components change.

Risks:
- Avoid leaking full file contents or secrets in telemetry; path lists and hash prefixes are enough.

## Milestone 5 — PlanLink auto-update for durable artifacts
Status: done
Depends on: existing `update_plan_status` tool; Milestone 1 helpful for typed state.

Purpose: stop `STATUS.md` and `LESSONS.md` from drifting during resumed implementation.

Tasks:
1. Read plan command flow:
   - `cli/src/commands/plan-artifacts.ts`
   - `cli/src/commands/prompt-builders.ts`
   - `cli/src/commands/router.ts`
   - `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts`
2. Define `PlanLink` state: session slug/path, active task id/title, current task status, last artifact update timestamp/hash.
3. Detect PlanLink from slash commands (`/resume-plan`, `/update-plan`) and explicit user phrases like `continue P0-1 in harness-weakness-fixes-2026-06` only when unambiguous.
4. On task start, update linked `STATUS.md` item to in-progress using `update_plan_status` semantics.
5. On validation/reviewer gate pass, mark task done and update next checkpoint.
6. On blocker/reviewer failure, record blocked state and next required action.
7. Append to `LESSONS.md` only for non-obvious gotchas/decisions; preserve user prose and avoid duplicate tail notes.
8. Add tests for PlanLink parsing, status-line update preservation, blocked/done transitions, and no-op when session is ambiguous.

Validation gate:
- `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts`
- `bun test cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts`
- Relevant new PlanLink tests.
- Typechecks for touched packages.

Completed slice:
- Base2 now exposes `update_plan_status` alongside `create_plan`.
- Plan-only prompts and CLI durable-plan command prompts now prefer `update_plan_status` for incremental `STATUS.md` / `LESSONS.md` updates while reserving `create_plan` for `SPEC.md`, `PLAN.md`, missing artifacts, and substantial rewrites.
- Generated agent tool type maps include `update_plan_status` so agent/typecheck surfaces agree with shared tool registration.
- Validation passed: focused Base2/CLI/update-plan-status tests, `bunx tsc --noEmit` in `agents/`, `cli/`, and `common/`.

Risks:
- Auto-updates must not surprise users by rewriting large hand-edited sections. Restrict edits to matching task lines and append-only lesson blocks.

## Milestone 6 — Lifecycle E2E coverage
Status: done
Depends on: Milestones 1, 3, and 4 recommended; completed as deterministic Base2 generator-boundary E2E/integration coverage.

Purpose: test the full harness behavior that unit tests miss.

Tasks:
1. Inspect existing `agents/e2e/` fixtures and patterns.
2. Add `agents/e2e/gate-lifecycle.e2e.test.ts` covering:
   - edit detected;
   - validation hook fails;
   - context pruning occurs;
   - blocker persists;
   - fix is applied;
   - reviewer returns BLOCKING;
   - second fix applied;
   - validation passes;
   - reviewer LOOKS_GOOD/NON_BLOCKING permits finalization.
3. Add `agents/e2e/reviewer-spawn-conditions.e2e.test.ts` covering P0-12 skip conditions and explicit skip reasons.
4. Use synthetic agents and mocked validation/reviewer outputs where possible; do not require external provider calls.
5. Keep tests deterministic and bounded; if true E2E is too slow, add integration tests at the run-agent-step/base2 generator boundary.

Validation gate:
- New E2E/integration tests pass locally: `bun test agents/e2e/gate-lifecycle.e2e.test.ts agents/e2e/reviewer-spawn-conditions.e2e.test.ts agents/__tests__/base2.test.ts` — pass.
- Existing focused unit tests still pass.
- Agents typecheck passes: `bunx tsc --noEmit` in `agents/` — pass.
- Test comments document the lifecycle invariants each step protects.

Risks:
- E2E tests can become flaky if they depend on real timing or model output. Prefer mocked generator/tool results.

## Milestone 7 — Documentation cleanup
Status: done
Completed after core behavior stabilized; docs now reflect actual landed behavior.

Purpose: make the architecture/request-flow docs accurate for Openbuff local/BYOK mode and the new harness invariants.

Tasks:
1. Read:
   - `docs/request-flow.md`
   - `docs/architecture.md`
   - `docs/deterministic-edit-system.md`
   - `docs/agents-and-tools.md`
   - `docs/local-mode.md`
2. Update request flow to clearly separate:
   - Openbuff local/BYOK CLI → SDK/runtime → local provider routing.
   - Legacy/upstream Codebuff server/cloud flow where still documented for compatibility/history.
3. Document runtime read-before-edit enforcement and recovery workflow once Milestone 2 lands.
4. Document reviewer gate fingerprint semantics once Milestone 3 lands.
5. Add or update a durable plan artifact doc if PlanLink auto-update lands.
6. Ensure docs use Openbuff primary names while noting compatibility aliases only where relevant.

Validation gate:
- Done: `bun run test:docs:integrity` in `web/` passed.
- Done: `bunx prettier --check docs/request-flow.md docs/architecture.md docs/deterministic-edit-system.md docs/agents-and-tools.md docs/local-mode.md docs/testing.md` passed after formatting touched Markdown.
- Done: targeted stale-wording search found only compatibility-specific `Codebuff` wording in the edited docs.

Risks:
- Avoid documenting intended behavior before implementation lands; update docs after corresponding milestones.

## Dependencies and ordering
Recommended order:
1. Milestone 0 — safety baseline.
2. Milestone 1 — extract gate helpers from `base2.ts` behavior-preservingly.
3. Milestone 2 — read-before-edit enforcement.
4. Milestone 3 — content fingerprints.
5. Milestone 4 — telemetry/skip diagnostics.
6. Milestone 5 — PlanLink auto-updates.
7. Milestone 6 — lifecycle E2E, or begin in parallel after helper APIs settle.
8. Milestone 7 — docs cleanup after behavior stabilizes.

Parallelizable work:
- Docs inventory can happen in parallel with implementation, but final doc edits should wait for landed behavior.
- E2E fixture exploration can happen while Milestones 1–3 are in progress.
- PlanLink tests can be developed independently of gate fingerprints.

## Checkpoint/update rules
- Update `STATUS.md` after each milestone status change.
- Update `PLAN.md` if task ordering or target files change materially.
- Update `SPEC.md` only if scope/goals/non-goals change.
- Append to `LESSONS.md` for non-obvious implementation decisions, failed approaches, reviewer blockers, validation gotchas, and compatibility constraints.
- Never mark a milestone done without recording its validation result.

## Artifact commands
- `/resume-plan harness-weakness-fixes-2026-06`
- `/plan-status harness-weakness-fixes-2026-06`
- `/update-plan harness-weakness-fixes-2026-06`
- `/lessons harness-weakness-fixes-2026-06`
