# PLAN — Independent Openbuff/Buffy Harness Audit

## Purpose
Turn the SPEC audit findings into a resumable, reviewable improvement packet. This plan is an implementation roadmap only; source changes should be done in later execution runs after the user approves a milestone.

## Milestone 0 — Audit packet completion
Status: complete

Tasks:
- [x] Create `SPEC.md` with goals, scope, findings, requirements, and acceptance criteria.
- [x] Create `PLAN.md` with prioritized milestones, validation gates, dependencies, and risks.
- [x] Create `STATUS.md` with current state, pending work, next checkpoint, and resume instructions.
- [x] Create `LESSONS.md` with durable audit notes and reusable gotchas.
- [x] Verify all four artifacts exist under `.agents/sessions/harness-independent-audit-2026-06/`.

Acceptance criteria:
- The audit packet is resumable without relying on chat history.
- The packet clearly separates audit/planning work from later source implementation.
- The next actionable milestone is explicit.

Validation:
- File-level verification that `SPEC.md`, `PLAN.md`, `STATUS.md`, and `LESSONS.md` exist.

## Milestone 1 — Runtime edit capability policy (P0)
Status: not started

Goal:
Enforce read-before-edit and deterministic edit authorization as runtime invariants instead of prompt-only guidance.

Target systems:
- `packages/agent-runtime/src/process-str-replace.ts`
- `packages/agent-runtime/src/process-edit-transaction.ts`
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
- Existing handlers for `rewrite_symbol` / `replace_range` if present in the runtime package
- `FileProcessingState` and related edit authorization state

Tasks:
- Inventory every existing file-changing tool path and classify whether it edits an existing file, creates a new file, or performs a structured edit.
- Define a single edit authorization model for existing-file edits.
- Apply the model consistently across `str_replace`, `write_file`, `edit_transaction`, `rewrite_symbol`, and `replace_range`.
- Preserve safe new-file creation behavior without requiring a prior read of a nonexistent path.
- Add regression tests for unsafe no-read edits, safe read-authorized edits, new-file creation, and stale capability rejection.

Acceptance criteria:
- Existing-file edits without a valid read/capability are blocked where strict mode applies.
- Existing-file edits with a valid current capability still work.
- New-file creation remains supported.
- Error messages explain the required recovery path.

Validation:
- Focused runtime edit-tool tests.
- Package typecheck for the runtime package.

Risks:
- Over-tightening may break legitimate small-file edits or generated-file flows.
- Capability checks must be clear enough for agents to recover without edit loops.

## Milestone 2 — Central changed-file and gate lifecycle tracking (P0)
Status: not started

Goal:
Move validation/reviewer correctness from base-agent orchestration heuristics toward a runtime-owned lifecycle for editing-capable agents.

Target systems:
- `agents/base2/base2.ts`
- `agents/base2/gate-state.ts`
- `agents/base2/gate-paths.ts`
- `agents/base2/gate-reviewer.ts`
- `packages/agent-runtime/src/tools/tool-executor.ts`
- Editing tool handlers and result metadata

Tasks:
- Identify how each edit tool reports changed files today.
- Add or standardize changed-file registration at the runtime/tool-executor layer.
- Ensure same-path content changes invalidate stale validation/reviewer approvals.
- Preserve explicit, blocking skip reasons when changed-file state is ambiguous.
- Add tests for changed-file registration, gate invalidation, and ambiguous-state blocking.

Acceptance criteria:
- Every source edit is centrally visible to the gate or explicitly exempted.
- Gate pass reuse is invalidated after same-path content changes.
- Finalization cannot silently proceed when changed files are unknown.

Validation:
- Focused gate-state and runtime tool-executor tests.
- Root or relevant package typecheck.

Risks:
- Current gate helpers duplicate serialized base-agent behavior; updates must not drift between production and tests.

## Milestone 3 — Gate helper de-duplication and policy tests (P0/P1)
Status: not started

Goal:
Reduce drift between inline serialized orchestration and helper modules.

Target systems:
- `agents/base2/base2.ts`
- `agents/base2/gate-state.ts`
- `agents/base2/gate-paths.ts`
- `agents/base2/gate-reviewer.ts`
- `agents/reviewer/code-reviewer.ts`

Tasks:
- Map duplicated helper logic to inline serialized equivalents.
- Decide whether to extract shared pure helpers, generate inline snippets, or add parity tests where serialization prevents direct reuse.
- Add tests covering reviewer verdict parsing, skip reasons, changed-file matching, and stale gate invalidation.
- Prefer structured reviewer verdicts for automated decisions while preserving text-mode compatibility if needed.

Acceptance criteria:
- Helper behavior cannot drift silently from production orchestration.
- Reviewer skip/pass/block decisions are observable and test-covered.
- No automated finalization depends on an untested text parsing path when structured verdicts are available.

Validation:
- Agent gate helper tests.
- Typecheck for the affected agent package.

Risks:
- `handleSteps` serialization may constrain direct imports; parity testing may be safer than aggressive refactoring.

## Milestone 4 — Structured subagent handoff propagation (P0)
Status: not started

Goal:
Ensure `handoff` data supplied to spawned agents is either delivered to child context or rejected, never silently dropped.

Target systems:
- `common/src/tools/params/tool/spawn-agents.ts`
- `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts`
- `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts`
- Direct agent tool transformation paths

Tasks:
- Trace all spawn-agent input schemas and transformations.
- Pass `handoff` into child-agent context/prompt in a structured, visible way, or reject it with a clear unsupported-field error.
- Update tests to prove constraints, artifacts, non-goals, success criteria, and summary reach spawned agents.
- Check direct agent tool paths for the same behavior.

Acceptance criteria:
- Parent-supplied handoff is visible to the child agent in a deterministic format.
- Unsupported handoff fields fail clearly rather than being ignored.
- Existing spawn behavior without handoff is unchanged.

Validation:
- Spawn-agent handler/unit tests.
- Typecheck for common/runtime packages.

Risks:
- Prompt/context formatting must avoid bloating every child invocation when no handoff is supplied.

## Milestone 5 — Validation hook policy and observability (P1)
Status: not started

Goal:
Make no-hook, skipped-hook, failed-hook, and truncated-output states explicit and reviewable.

Target systems:
- `sdk/src/tools/file-change-hooks.ts`
- `sdk/src/tools/run-file-change-hooks.ts`
- Base gate handling of validation results

Tasks:
- Audit current file-change hook matching and reporting.
- Add explicit policy for source edits where no hooks run.
- Improve output summaries enough to debug failures without dumping huge logs.
- Add tests for no hooks configured, hooks skipped, failure output truncation, and successful hook runs.

Acceptance criteria:
- Agents and users can tell whether validation passed, failed, was skipped, or had no configured hooks.
- Source-edit finalization treats no-hook cases according to an explicit tested policy.

Validation:
- SDK hook tests.
- Relevant typecheck.

Risks:
- Some repositories intentionally have no hooks; policy must be explicit without blocking all lightweight projects by default.

## Milestone 6 — Durable plan artifact policy centralization (P1)
Status: not started

Goal:
Centralize rules for plan artifact paths, required files, and resume/update behavior.

Target systems:
- `common/src/tools/params/tool/create-plan.ts`
- `common/src/tools/params/tool/update-plan-status.ts`
- `cli/src/commands/prompt-builders.ts`
- `cli/src/commands/plan-artifacts.ts`
- `cli/src/commands/router.ts`
- `cli/src/hooks/use-send-message.ts`

Tasks:
- Identify duplicated plan-artifact validation logic.
- Introduce or strengthen one authoritative validator for allowed artifact paths.
- Ensure non-trivial durable planning flows create or explicitly defer `SPEC.md`, `PLAN.md`, `STATUS.md`, and `LESSONS.md`.
- Add tests for allowed paths, rejected paths, missing artifact recovery, and resume instructions.

Acceptance criteria:
- Plan artifact path policy is enforced consistently by CLI and tools.
- Resumable plans do not reference missing artifacts without an explicit deferred-generation note.

Validation:
- CLI command/tool tests for plan artifacts.
- Relevant typecheck.

Risks:
- Existing plan-only flows may intentionally create a single artifact; preserve this via explicit scope/wording rather than accidental incompleteness.

## Milestone 7 — P2 cleanup and performance follow-ups
Status: not started

Goal:
Address lower-risk maintainability improvements after P0/P1 invariants are stable.

Tasks:
- Consolidate base-agent spawn permission logic.
- Evaluate parallel validation hook execution where safe.
- Consider a runtime-owned gate lifecycle object that reduces message/state serialization complexity.
- Improve validation output retention and developer ergonomics.

Acceptance criteria:
- No P2 cleanup weakens P0/P1 safety guarantees.
- Performance changes preserve deterministic reporting and failure handling.

Validation:
- Focused tests for any changed subsystem.
- Typecheck for touched packages.

## Global validation guidance
Before marking any implementation milestone complete:
- Run the focused tests for touched files/packages.
- Run package-level typecheck when available.
- Run broader root typecheck only when changes cross package boundaries or public types.
- Record validation commands and outcomes in `STATUS.md`.

## Resume order
1. Milestone 0 artifact packet is complete.
2. Ask for or confirm approval before implementing Milestone 1 source changes.
3. Execute milestones in order unless a later milestone is explicitly split out and approved.
