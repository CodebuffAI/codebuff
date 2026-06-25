# SPEC — Independent Openbuff/Buffy Harness Audit

## Overview
This session captures an independent audit of the current Openbuff/Buffy harness and a resumable improvement plan. The audit focuses on the active orchestration/runtime/tooling code, not historical improvement plans.

## Goals
- Identify concrete weaknesses in the current harness that can cause unsafe edits, skipped validation/review, stale gate approval, weak subagent handoff, plan-artifact drift, or poor resumability.
- Prioritize fixes by correctness risk and implementation dependency.
- Define acceptance criteria and validation gates for each improvement milestone.
- Preserve local-first/BYOK behavior and current CLI/SDK architecture while strengthening runtime invariants.

## Non-goals
- Do not reintroduce hosted web/billing/product-credit surfaces.
- Do not perform source implementation in PLAN mode.
- Do not rely on deleted historical plan artifacts as authoritative context.
- Do not make broad cosmetic refactors unless required to enforce a correctness invariant.
- Do not rename legacy metrics such as `creditsUsed` as part of this harness hardening unless a later dedicated refactor is approved.

## Systems audited
- Root orchestration/default agent behavior: `agents/base2/base2.ts`
- Gate helper modules: `agents/base2/gate-state.ts`, `agents/base2/gate-paths.ts`, `agents/base2/gate-reviewer.ts`
- Reviewer agent: `agents/reviewer/code-reviewer.ts`
- Agent runtime loop and tool execution: `packages/agent-runtime/src/run-agent-step.ts`, `packages/agent-runtime/src/tools/tool-executor.ts`
- Subagent spawning: `packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts`, `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts`, `common/src/tools/params/tool/spawn-agents.ts`
- Edit tools: `packages/agent-runtime/src/process-str-replace.ts`, `packages/agent-runtime/src/process-edit-transaction.ts`, `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`
- Validation hooks: `sdk/src/tools/file-change-hooks.ts`, `sdk/src/tools/run-file-change-hooks.ts`
- Plan mode and CLI plan commands: `common/src/tools/params/tool/create-plan.ts`, `common/src/tools/params/tool/update-plan-status.ts`, `cli/src/commands/prompt-builders.ts`, `cli/src/commands/plan-artifacts.ts`, `cli/src/commands/router.ts`, `cli/src/hooks/use-send-message.ts`

## Key findings

### P0 — correctness hardening
1. Runtime read-before-edit is staged/partial rather than universally enforced.
   - `FileProcessingState` exposes `strictReadBeforeEdit` and `readAuthorizationsByPath`, but default edit behavior still allows many edits based only on exact matching.
   - `str_replace` requires strong anchors mostly for large files; small-file edits can bypass the prompt-level read-before-edit policy.
   - Existing-file `write_file`, `rewrite_symbol`, `replace_range`, and transactions need a single runtime capability story.

2. Validation/reviewer gate correctness lives mostly inside serialized `base2` orchestration.
   - The gate is not yet a first-class runtime service shared by every editing-capable agent.
   - Fast/no-validation variants, custom/local agents, direct tool paths, or future agents can diverge from default safety expectations.

3. Gate helper duplication is fragile.
   - Extracted helpers in `gate-paths.ts` / `gate-reviewer.ts` intentionally duplicate inline implementations because `handleSteps` is serialized.
   - Production and tested helper behavior can drift unless tested or generated together.

4. Structured subagent handoff is defined but not propagated.
   - `agentHandoffSchema` exists, but `handleSpawnAgents` destructures only `agent_type`, `prompt`, and `params`.
   - Direct agent tool transformation also omits handoff.
   - Parent agents may believe constraints/artifacts were passed while child agents never see them.

### P1 — gate policy and observability
5. Changed-file detection still relies on layered heuristics.
   - The gate infers edits from tool results, message history, and git status. There is a circuit breaker for ambiguous state, but prevention is stronger than recovery.

6. Validation can pass with no configured hooks.
   - `run_file_change_hooks` can produce “No configured file-change hooks ran.” The gate then may continue to reviewer/finalization.
   - This is acceptable only if explicit, visible, and test-covered for source edits.

7. Reviewer verdict parsing supports structured JSON but still accepts text-mode prefixes.
   - This is practical, but automated finalization should eventually prefer/fail-closed on structured verdicts.

8. Durable plan-artifact policy is enforced in multiple layers.
   - Prompt instructions, CLI helpers, and tool runtime policy need a single authoritative validator to prevent drift.

### P2 — maintainability and performance
9. Base-agent spawn permission logic is duplicated.
10. Validation hooks run sequentially and truncate output with fixed limits.
11. Gate state is serialized partly through agent state/messages rather than one runtime-owned lifecycle object.

## Requirements
- Runtime invariants must not depend only on prompt instructions.
- Every file-changing tool path must either register changed files with the gate or be explicitly exempted.
- Reviewer/validation gate skip reasons must be explicit, observable, and test-covered.
- Structured subagent handoff must be visible to spawned agents when supplied.
- Plan artifacts must remain strictly under `.agents/sessions/<slug>/{SPEC,PLAN,STATUS,LESSONS}.md`.
- Changes must preserve existing local-agent, CLI, SDK, and test behavior unless explicitly scoped by a milestone.

## Acceptance criteria
- P0 milestones have unit tests proving unsafe behavior is blocked and safe behavior still works.
- Any source edit made by an editing-capable agent is tracked in a central gate state or produces an explicit blocking skip reason.
- Gate pass reuse is invalidated by same-path content changes.
- Subagent `handoff` is either delivered to child context or rejected if unsupported; it is never silently dropped.
- Plan mode creates all four durable artifacts for non-trivial plans and update/resume commands keep STATUS/LESSONS current.
- Validation commands listed in PLAN.md pass for touched packages before each milestone is marked done.

## Assumptions
- Existing broad BYOK cleanup worktree changes are user-owned and should not be reverted by this plan.
- The implementation should be split into small runs to keep review/validation manageable.
- Root `bun run typecheck` and focused package tests are the preferred validation gates when feasible.
