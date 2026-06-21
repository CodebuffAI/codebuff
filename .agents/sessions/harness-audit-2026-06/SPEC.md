# Openbuff Harness Audit — SPEC

## Overview
Audit of the Openbuff agent harness covering: context gathering/reading, editing/writing, context compaction/pruning, cross-agent context sharing, the agent roster itself, and reviewer/quality-gate + planning loops. Goal: identify concrete correctness, robustness, and efficiency improvements the harness can enforce.

## Goals
- Catalog the current control loop (base2 → editor → validation hooks → reviewer → final response) and its enforcement mechanisms.
- Identify mismatches between mandates in system prompts and what the runtime actually enforces.
- Surface places where correctness depends on model discipline rather than deterministic guards.
- Recommend high-leverage harness changes (deterministic, testable) over more prompt tweaks.

## Non-goals
- Implementing changes (plan mode).
- Re-architecting the agent definition format.
- Replacing the reviewer model / changing providers.

## Audited surfaces
- `agents/base2/base2.ts` — orchestrator state machine (`base2ActiveWork`), verification + reviewer gate, durable gate-pass cache.
- `agents/base2/base-deep.ts` — deep-thinking variant prompts.
- `agents/editor/editor.ts` — editor tool list, structured-output `changedFiles`.
- `agents/reviewer/code-reviewer.ts` — review prompt + LOOKS_GOOD/BLOCKING/NON_BLOCKING contract.
- `agents/context-pruner.ts` — block/turn pruning, reviewer-blocker preservation, summarization.
- `agents/file-explorer/file-picker.ts` — discovery agent.
- `packages/agent-runtime/src/run-agent-step.ts` — step loop, tool dispatch, parent context propagation.
- `packages/agent-runtime/src/process-str-replace.ts` + `process-edit-transaction.ts` — deterministic edit gates (basedOnRead, occurrence handling, atomic batch).
- `packages/agent-runtime/src/tools/handlers/tool/spawn-agent*.ts` — subagent spawning, parent context handoff.
- `packages/agent-runtime/src/util/messages.ts` — trim/expire/filter helpers feeding pruner.
- `sdk/src/run.ts` — top-level run loop, hook invocation, structured outputs.
- Docs: `docs/architecture.md`, `docs/request-flow.md`, `docs/deterministic-edit-system.md`, `docs/agents-and-tools.md`, `docs/testing.md`.

## Acceptance criteria for the audit deliverable
- A categorized list of strengths, with the harness mechanism that enforces each.
- A categorized list of weaknesses with severity (High / Medium / Low) and a concrete remediation.
- A prioritized recommendation list keyed to files/symbols, suitable for spawning into focused implementation tasks later.
