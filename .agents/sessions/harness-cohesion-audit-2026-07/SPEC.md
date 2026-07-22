# SPEC — Agent / Tool / Reviewer Harness Cohesion

## Overview

The Openbuff harness has accumulated a large, capable set of agents (46 shipped), 61 registered tools, 14 specialists, 3 aux gates + a validation/reviewer gate, and a multi-mode orchestrator family (`base2` / `base2-plan` / `base2-execute-plan` / `base-deep` / fast variants). A recent burst of feature additions left the pieces individually strong but weakly coordinated: multiple hand-maintained rosters drift against each other, some prompt guidance tells the coordinator to do things the tools/gates don't actually support (and omits capabilities that do exist), and gate logic is duplicated inline without full parity guards.

This spec captures a source-backed audit and a remediation plan to restore cohesion so the orchestrator fully and correctly uses every part of the harness.

## Goals

- Establish a single (or generated) source of truth for the agent roster so spawnable/routed/bundled/persona lists cannot silently drift.
- Align orchestrator prompt guidance with actual harness capabilities: remove instructions the harness can't honor, and surface real capabilities the coordinator currently under-uses.
- Make the multi-mode orchestrator family (DEFAULT / PLAN / EXECUTE_PLAN / base-deep / fast) consistent in spawnable agents, gate wiring, and step-prompt guidance except where a difference is intentional and documented.
- Close drift risk in the inline-mirrored gate logic with parity guards and shared frozen lists.
- Clean the tool registry of dead/orphaned/deprecated-but-visible tools.
- Decide the fate of the parallel `orchestration/` subsystem (authoritative vs telemetry-only).

## Non-Goals

- No behavioral redesign of the reviewer verdict contract, deterministic-edit system, or context-compaction budgets (those are cohesive already).
- No model-routing/provider changes.
- No new agents or tools beyond what's needed to close a gap.
- Not touching `agents-graveyard/` (already dead, no shipped imports).

## Key Findings (source-backed, from sharded audit at snapshot `68f0ffb8…`)

### Roster drift (no single source of truth)
- Agent roster is maintained in 5 independent places: `agents/**/*.ts` default exports (de-facto truth), `cli/src/agents/bundled-agents.generated.ts` (generated, in sync), `openbuff.d.example/routes.json` (hand, **12 dead unshipped ids**), `common/src/constants/agents.ts` `AGENT_PERSONAS`/`AGENT_IDS` (hand, **missing ~18 shipped, includes 6 non-shipped**: `ask`, `planner`, `agent-builder`, `reviewer`, `file-explorer`, `researcher`), and `spawnableAgents` arrays in `base2.ts:116`, `base-deep.ts:352`, `general-agent.ts`.
- `directory-lister` and `glob-matcher` are bundled + registered + routed but **NOT spawnable by any orchestrator** (dead-end agents).

### Orchestrator family inconsistency
- `base-deep.ts:352` hand-overrides `spawnableAgents`, dropping `context-pruner` and `tmux-cli` that `base2`'s computed list includes.
- `base2-fast` omits `browser-use` (present in DEFAULT/PLAN/EXECUTE_PLAN).
- EXECUTE_PLAN step prompt (`buildExecutePlanStepPrompt`, base2.ts:6424) **drops** the editor-handoff / "don't manually spawn code-reviewer" guidance that DEFAULT's `buildImplementationStepPrompt` carries.
- `gateAwarenessSection` is conditional (`isDefault`) in base2 but **unconditional** in base-deep — divergent gating.
- PLAN's instruction builder (`buildPlanOnlyInstructionsPrompt`) reimplements blocks rather than composing from the implementation builder — the main prompt drift surface.

### Prompt ↔ capability mismatch (core of the complaint)
- **HIGH:** `buildBroadAuditSection` (quality-prompt-section.ts step 4) tells the coordinator to call `evaluate_audit_coverage` with each shard's `structuralReceipt`, but the shards it names in steps 1–3 are `file-picker`/`code-searcher` (discovery-only) which **cannot emit `structuralReceipt`**. Only `general-agent` audit shards emit it via `write_audit_findings`. The prompt's produce-path and consume-path don't connect.
- `write_audit_findings` / `synthesizer` / `general-agent` durable-findings flow is essentially invisible in the orchestrator prompt, so the coordinator won't reliably use it.
- `frontendSection` re-export at `quality-prompt-section.ts:77` is production-dead (only the snapshot test imports it; production uses the `{CODEBUFF_FRONTEND_SECTION}` placeholder).

### Gate / reviewer drift risk
- Entire gate lifecycle is inline-mirrored inside `createBase2.handleSteps` (serialized via `.toString()`), with canonical copies in `gate-*.ts`.
- Parity guards exist for `gate-repair.ts` and `gate-reviewer.ts` (good), but the aux-path helpers `normalizeGateFilePath`, `normalizeGateFileList`, `gateFileSetsEqual` (`gate-paths.ts`) have **no cross-implementation parity test** — `gate-aux-triggers.test.ts` only tests the inline copies.
- Security-sensitive glob list is duplicated (inline gate predicate vs `securityReviewSection`), kept in sync by convention only.

### Tool registry hygiene
- schema/handler/metadata form a compile-enforced bijection (good).
- Dead tools (active + promptVisible, granted to no agent): `lookup_agent_info`, `render_ui`, `find_files`, `find_files_matching_content`.
- `read_slices` is correctly quarantined in metadata but still in `publishedTools` and the generated `agents/types/tools.ts` type surface.
- `tool-reachability.test.ts` does not enumerate all structured-output agents (coverage gap).

### Orchestration subsystem duality
- `packages/agent-runtime/src/orchestration/` (`select-agent-attempt`, `workflow-engine`, `discovery-coordinator`) is invoked but advisory/bookkeeping; the authoritative orchestration is the base2 inline gate. `workflow-engine` is telemetry-only — a dual-system smell.

### Discovery agent boundaries
- `basher` has no `terminalPermissionProfile` while debugger/git-committer/dependency-manager/librarian all do.
- `file-picker` ↔ `file-lister` overlap (file-lister is file-picker's internal worker yet carries its own spawnerPrompt).

## Relevant Files / Systems

- Orchestrator: `agents/base2/base2.ts`, `base2-plan.ts`, `base2-execute-plan.ts`, `base2-fast*.ts`, `base-deep.ts`
- Prompt sections: `agents/base2/quality-prompt-section.ts`, `common/src/constants/prompt-sections.ts`, `common/src/constants/git-discipline.ts`, `packages/agent-runtime/src/templates/{strings,types}.ts`
- Gates: `agents/base2/gate-{state,files,paths,repair,reviewer}.ts`, parity tests in `agents/__tests__/gate-*.test.ts`
- Reviewers/specialists: `agents/reviewer/code-reviewer.ts`, `agents/security-reviewer/security-reviewer.ts`, `agents/specialists/create-specialist.ts`, `common/src/agents/specialist-risk-router.ts`
- Roster/routing: `common/src/constants/agents.ts`, `openbuff.d.example/routes.json`, `cli/scripts/prebuild-agents.ts`, `cli/src/agents/bundled-agents.generated.ts`
- Tools: `common/src/tools/{constants,list,metadata}.ts`, `packages/agent-runtime/src/tools/handlers/list.ts`, `agents/tool-reachability.test.ts`
- Runtime coordination: `packages/agent-runtime/src/tools/handlers/tool/spawn-agent-utils.ts`, `.../orchestration/*`
- Docs: `docs/agents-and-tools.md`, `agents/patterns/INDEX.md`

## Acceptance Criteria

- A guard test fails if any `routes.json` / persona / spawnable entry references an id that is neither a shipped/bundled agent nor an explicitly-allowlisted external CLI agent.
- `AGENT_PERSONAS`/`AGENT_IDS` either derived from bundled agents or reconciled + guarded.
- `directory-lister` / `glob-matcher` are either reachable or removed, with a test asserting no bundled agent is silently unreachable.
- `base-deep` and `base2` spawnable lists are consistent (test-guarded superset relationship) with intentional deltas documented.
- EXECUTE_PLAN and DEFAULT step prompts share editor-handoff guidance; PLAN composes from shared builders.
- `buildBroadAuditSection` routes audit shards to the agent(s) that actually emit receipts, and the audit doc + prompt agree.
- Aux-path gate helpers gain a parity test; security-glob list has one frozen source + parity test.
- Dead tools resolved; `read_slices` removed from published/generated surface.
- A documented decision on `orchestration/` (keep-as-telemetry vs remove vs promote), with a test or doc note reflecting it.
- All touched packages pass their typecheck + tests.
