# Openbuff Harness Improvements — STATUS

## Current state
- Audit complete.
- Implementation has started.
- P0-12 reliable reviewer-gate spawning baseline safeguards are implemented and validated in focused tests.
- P0-10 plan-mode lifecycle and discoverability is implemented for the requested scope: full-packet guidance, real CLI slash commands, artifact-aware resume/update/status/lessons flows, create_plan companion warnings, and focused validation.
- Safe-batch hardening is implemented and validated for: reviewer gate fingerprint baseline, base2 typed/pinned gate state, structured reviewer verdict parsing, stricter create_plan path enforcement, editor handoff brief enforcement, and removed-agent registry/reference tests.
- P0-11 `update_plan_status` tool is now implemented as a durable, scoped session-artifact updater (STATUS.md/LESSONS.md only).
- P2-9 UI gate-state rendering now has a narrow parser + dedicated `gate-state` block + `GateStateBox` renderer; broader UI integration remains optional follow-up.
- P1-6 now exposes a formal optional `AgentHandoff` schema on `spawn_agents` params; consumers are not required to use it.
- P0-1 runtime read-before-edit remains deferred by user choice.
- Working tree has many unrelated in-progress changes from prior sessions; do not assume all modified files belong to this audit task.

## Completed this implementation pass

### P0-12 — Reliable reviewer-gate spawning baseline
Status: done for baseline safeguards

Implemented:
- `code-reviewer` is available to base2-family flows instead of being gated solely by the default base2 ID.
- Reviewer gate now has durable active-work state for changed files, pending gate files, validation summary, reviewer blockers, and reviewer skip/error reasons.
- Gate state is pinned back into the conversation so context compaction preserves the controlling next action.
- If edits are detected but no pending gate files exist, finalization is blocked with an explicit unsafe-gate message instead of silently skipping review.
- Direct edit tool calls in message history are detected, including `str_replace`, `write_file`, `rewrite_symbol`, `edit_transaction`, and proposal/edit artifacts where applicable.
- Path normalization is centralized for gate file comparisons, including relative paths, absolute workspace paths, and `file://` paths.
- Fast/no-validation mode behavior is explicit in tests.
- Existing reviewer pass/block/non-block flows remain covered.

Validation:
- `bun test agents/__tests__/base2.test.ts` — 28 pass, 0 fail.

### P0-10 — Plan-mode lifecycle and discoverability
Status: done for requested slash-command/runtime-warning scope

Implemented:
- Plan-mode prompt now tells the agent that non-trivial plans should create the full durable packet by default: `SPEC.md`, `PLAN.md`, `STATUS.md`, `LESSONS.md`.
- Normal users should not need to ask separately for `STATUS.md` or `LESSONS.md`.
- Plan-mode prompt clarifies artifact paths under `.agents/sessions/<slug>/` and forbids project-source edits in plan mode.
- `create_plan` tool description now supports durable multi-day plan sessions and explicitly documents the four artifacts.
- `create_plan` handler now safely initializes per-path promise tracking when the path entry does not exist.
- Focused base2 prompt test covers the full durable artifact requirement.
- CLI registers real `/resume-plan`, `/plan-status`, `/update-plan`, and `/lessons` slash commands, including aliases `rp`, `ps`, `up`, and `lesson`.
- Added `cli/src/commands/plan-artifacts.ts` to resolve session slugs/paths, reject project-root escapes, read the four durable artifacts, and format them for prompts.
- `/resume-plan` and `/update-plan` route artifact contents into PLAN-mode prompts.
- `/plan-status` reports local artifact/status content without sending to the agent.
- `/lessons` routes artifact contents into a PLAN-mode LESSONS.md update prompt.
- `create_plan` emits a warning when writing a non-trivial `.agents/sessions/<slug>/PLAN.md` without queued STATUS.md or LESSONS.md companion updates.
- Added focused CLI command tests and create_plan warning tests.

Still pending beyond requested P0-10 scope:
- Hard blocking enforcement for incomplete plan packets remains a possible future P2/P0 follow-up; current behavior warns instead of blocking.
- Auto-updating STATUS.md/LESSONS.md during execution remains P0-11.
- Stricter create_plan path/session validation remains P2-7.

Validation:
- `bun test agents/__tests__/base2.test.ts` — 28 pass, 0 fail.
- `bun --cwd=cli tsc --noEmit` — pass.
- `bun test cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/create-plan.test.ts` — 86 pass, 0 fail, 266 expect calls.

## Tasks at a glance

### P0 — Correctness hardening
- P0-1  Runtime-enforce "read before edit" — deferred
- P0-2  Diff/content fingerprint for reviewer gate pass — partial/done for gate fingerprint baseline; full file-content hashing remains future hardening
- P0-3  Typed gate-state object preserved across pruning — done for base2 typed state + pinned context-pruner preservation
- P0-10 Plan-mode default lifecycle and discoverability — done for requested slash-command/runtime-warning scope
- P0-11 Auto-update plan artifacts during execution — done for explicit `update_plan_status` tool (scoped to STATUS.md/LESSONS.md, rejects absolute/`..` paths, preserves user prose); automatic emission during execution remains optional follow-up
- P0-12 Reliable reviewer-gate spawning — done for baseline safeguards; re-edits now clear prior gate pass state and durable reuse requires matching fingerprint baseline

### P1 — Reliability and debuggability
- P1-4  Structured reviewer output — done for minimal JSON verdict/findings parsing with text fallback
- P1-5  Lifecycle e2e tests — absorbed into focused unit coverage for safe-batch items; broader e2e still todo
- P1-6  Standard subagent handoff envelope — done for formal optional `AgentHandoff` zod schema on `spawn_agents` params (backward-compatible; consumers may ignore)

### P2 — Workflow polish
- P2-7  Plan artifact path enforcement — done for create_plan durable artifact paths
- P2-8  Agent registry/reference cleanup tests — done for removed base-max/multi-prompt/best-of-n references in active definitions
- P2-9  UI rendering for blocker/gate state — done for narrow parser + dedicated `gate-state` content block + `GateStateBox` renderer; broader stream-integration remains optional follow-up

## Next checkpoint
Recommended next order:

1. **P0-1** — runtime-enforced read-before-edit, if/when the user wants the high-risk enforcement batch.
2. **P2-9 follow-up** — wire `parseGateStateBlock` into the live message stream so emitted gate-state blocks get scrubbed from prose and promoted into the new `GateStateBox` automatically.
3. **P0-11 follow-up** — opt-in auto-emission of `update_plan_status` from base2 flows when PlanLink is active.
4. **P1-5** — broader lifecycle e2e tests beyond the focused unit coverage now in place.
5. **P0-2 follow-up** — upgrade the current gate fingerprint baseline to hash working-tree file content if stronger stale-approval protection is needed.

## Blocked
- None.

## Open questions
- For P0-10 follow-up/P2-7: should lifecycle enforcement eventually block finalization, or is the current create_plan warning sufficient?
- For P0-11: should slash-command-driven updates also auto-link the active execution turn to a PlanLink?
- For P0-12: should reviewer skip reasons be emitted as telemetry events in addition to pinned state?
- For P0-2: should fingerprints hash full file content only, or include diff hunks plus validation command identity?
- For P0-1: capability key on absolute or workspace-relative paths? Default: workspace-relative, normalized.
- For P1-4: keep prefix parsing forever or sunset after N versions?
- For P2-7: enforce path constraint only in plan mode, or always under `.agents/sessions/`?
- For P0-11: should auto-status-update be opt-in per session, or default on whenever a PlanLink is detected?
- For the current P0-2 baseline: should gate fingerprints be upgraded from normalized path/status-line/validation-summary to full working-tree file-content hashes?

## Resume instructions
1. Read SPEC.md, PLAN.md, this STATUS.md, and LESSONS.md.
2. Pick the next task per "Next checkpoint" or user direction.
3. Re-read the task's target files via read_files before editing.
4. After completing a task:
   - Flip its status in this STATUS.md and update "Next checkpoint".
   - Append non-obvious findings to LESSONS.md.
   - Update PLAN.md if the plan shape changed.

## Validation history
- 2026-06-19: `bun test agents/__tests__/base2.test.ts` — 28 pass, 0 fail.
- 2026-06-19: `bun --cwd=cli tsc --noEmit` — pass.
- 2026-06-19: `bun test cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/create-plan.test.ts` — 86 pass, 0 fail, 266 expect calls.
- 2026-06-20: `bun test agents/__tests__/base2.test.ts agents/__tests__/context-pruner.test.ts agents/tool-reachability.test.ts packages/agent-runtime/src/tools/handlers/tool/__tests__/create-plan.test.ts cli/src/commands/__tests__/command-args.test.ts cli/src/commands/__tests__/router-input.test.ts` — pass.
- 2026-06-20: `bun --cwd=cli tsc --noEmit` — pass.
- 2026-06-20: `bun --cwd=agents tsc --noEmit` — pass.
- 2026-06-20: `bun --cwd=packages/agent-runtime tsc --noEmit` — pass.
- 2026-06-20: `bun test cli/src/utils/__tests__/message-block-helpers.test.ts` — pass.
- 2026-06-20: `bun test packages/agent-runtime/src/tools/handlers/tool/__tests__/update-plan-status.test.ts` — pass.
- 2026-06-20: `bun --cwd=cli tsc --noEmit` — pass after renaming the CLI gate-state block field from `status` to `gateStatus` to avoid widening generic `ContentBlock.status` updates.
- 2026-06-20: `bun --cwd=common tsc --noEmit` — pass.
- 2026-06-20: `bun --cwd=packages/agent-runtime tsc --noEmit` — pass.

## Available plan commands
- /resume-plan harness-audit-2026-06
- /plan-status harness-audit-2026-06
- /update-plan harness-audit-2026-06
- /lessons harness-audit-2026-06
