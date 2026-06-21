# Harness Weakness Fixes — SPEC

## Overview
Create an implementation roadmap to address the harness weaknesses identified in the source-quality audit: oversized `base2.ts`, incomplete runtime read-before-edit enforcement, baseline-only reviewer freshness fingerprints, thin lifecycle E2E coverage, plan artifact drift, limited gate telemetry, and stale/confusing request-flow documentation.

## Goals
- Move correctness-critical guarantees from prompts/agent discipline into typed, tested runtime modules.
- Reduce `agents/base2/base2.ts` orchestration complexity by extracting cohesive gate-state, fingerprint, edit-detection, and plan-link helpers.
- Enforce read-before-edit deterministically for real edit tools while preserving practical escape hatches for new files, generated paths, and explicit capabilities.
- Upgrade reviewer-gate freshness from baseline path/status fingerprints to working-tree content fingerprints.
- Add end-to-end lifecycle tests covering validation failure, context pruning, reviewer blocking, fixes, revalidation, finalization, and reviewer-spawn edge cases.
- Prevent durable plan artifact drift with explicit PlanLink detection and controlled `STATUS.md`/`LESSONS.md` updates.
- Add structured telemetry/logging for gate decisions, reviewer skips, fingerprint reuse, validation status, and blocker state.
- Refresh docs so local/BYOK Openbuff runtime flow is clearly separated from legacy/upstream Codebuff server flow.

## Non-goals
- Replacing the current agent architecture or removing specialized subagents.
- Changing provider/model routing behavior except where needed for validation tests.
- Rewriting the CLI UI beyond surfacing gate state already planned/implemented.
- Removing upstream compatibility aliases such as `codebuff.json`, `CODEBUFF_*`, or `@codebuff/*` package names.
- Running broad scripted refactors across the whole repository without targeted reads and tests.

## Requirements
1. Preserve current working-tree changes unrelated to this plan; inspect `git_status` before editing during implementation.
2. Read target files before any edit; for large files use outlines/symbol reads/ranges.
3. Keep changes staged by milestone where possible so each gate can be independently validated.
4. Maintain backward compatibility for existing agents and tests unless a stricter invariant is intentionally introduced.
5. Fail safe: ambiguous reviewer output, stale fingerprints, or unsafe edit state must block finalization rather than silently pass.
6. Every extracted module must have focused unit tests before depending on it from `base2.ts`.
7. E2E lifecycle tests may use synthetic agents/fixtures rather than live providers.
8. Update `STATUS.md` after each milestone and append non-obvious gotchas to `LESSONS.md`.

## Acceptance criteria
- `base2.ts` delegates gate-state, fingerprinting, edit detection, and plan-link logic to smaller typed helpers without behavior regressions.
- Edit tools reject edits without a recent compatible read/capability unless the operation is explicitly exempted.
- Reviewer gate pass reuse is keyed to sorted path plus working-tree content hash plus validation/reviewer context, not just path membership.
- Lifecycle E2E tests cover edit → validation fail → prune → fix → reviewer block → fix → validation/reviewer pass → final response.
- Reviewer skip reasons and gate decisions are visible in pinned state and available as structured telemetry/log lines.
- Plan artifact commands and/or PlanLink flow keep `STATUS.md` and `LESSONS.md` current during resumed execution.
- Docs accurately describe Openbuff local/BYOK request flow and clearly mark legacy/upstream compatibility surfaces.

## Relevant systems and files

### Orchestration and gates
- `agents/base2/base2.ts` — current central orchestrator; primary decomposition target.
- `agents/context-pruner.ts` — must preserve gate state, blockers, PlanLink, and next required action across compaction.
- `agents/reviewer/code-reviewer.ts` — reviewer verdict contract and structured output expectations.
- `agents/editor/editor.ts` — changed-file reporting and editor handoff constraints.

### Runtime edit enforcement
- `packages/agent-runtime/src/run-agent-step.ts` — step loop and candidate home for per-turn read capability tracking.
- `packages/agent-runtime/src/process-str-replace.ts` — `str_replace` enforcement and stale-anchor behavior.
- `packages/agent-runtime/src/process-edit-transaction.ts` — atomic transaction preflight and edit gating.
- `packages/agent-runtime/src/tools/handlers/tool/write-file.ts` — create-vs-overwrite exemptions.
- `packages/agent-runtime/src/tools/handlers/tool/read-files.ts` and `sdk/src/tools/read-files.ts` — read capability generation/validation path.

### Plan artifacts
- `packages/agent-runtime/src/tools/handlers/tool/create-plan.ts` — durable artifact path rules and companion warnings.
- `packages/agent-runtime/src/tools/handlers/tool/update-plan-status.ts` — scoped status/lesson mutation tool.
- `common/src/tools/params/tool/update-plan-status.ts` — schema.
- `cli/src/commands/plan-artifacts.ts`, `cli/src/commands/router.ts`, `cli/src/commands/command-registry.ts`, `cli/src/data/slash-commands.ts` — durable plan slash commands.

### Tests
- `agents/__tests__/base2.test.ts` — canonical gate/reviewer unit coverage.
- `agents/__tests__/context-pruner.test.ts` — blocker/state preservation.
- `agents/__tests__/code-reviewer.test.ts` — reviewer prompt and verdict contract.
- `packages/agent-runtime/src/__tests__/read-files-edit-state.test.ts` — read/edit state patterns.
- `packages/agent-runtime/src/__tests__/process-str-replace.test.ts` — replacement enforcement.
- `packages/agent-runtime/src/__tests__/process-edit-transaction.test.ts` — transaction preflight.
- `agents/e2e/` — lifecycle E2E test home.

### Docs
- `docs/request-flow.md` — request lifecycle must distinguish Openbuff local/BYOK flow from upstream server flow.
- `docs/architecture.md` — architecture overview.
- `docs/deterministic-edit-system.md` — edit capabilities and recovery rules.
- `docs/agents-and-tools.md` — agent/tool architecture.
- Optional new `docs/plan-artifacts.md` — durable plan artifact lifecycle.
