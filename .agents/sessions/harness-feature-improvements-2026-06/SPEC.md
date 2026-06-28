# SPEC — Openbuff Whole-Harness Feature Improvements (v3, full-codebase audit)

## Overview

A coordinated set of feature improvements across every subsystem of the Openbuff CLI AI coding-agent harness, grounded in a whole-codebase parallel-shard audit. This v3 supersedes v1/v2, which hyperfixated on the reviewer's example surfaces and never audited the orchestrator, runtime, CLI UX, SDK, edit tools, context management, or the planner itself. v3 folds in all prior source-verified corrections and adds the user's explicit meta-observation: **the plan-mode planner defaults to low-effort analysis and systematically ignores whole subsystems unless forced.**

## Goals

1. Raise subagent output quality and close capability gaps (missing agent roles, model right-sizing, recursion safety).
2. Harden the orchestrator decision logic (parallelism, repair-loop escalation, adaptive spawning, deep-variant gate parity).
3. Make context/memory management proactive instead of delegated-to-model or crude-fallback.
4. Fix real bugs found by the audit (SDK failover, retry config drift, dead code).
4. Improve CLI UX with high-leverage interactions the audit surfaced.
5. Add the meta-improvement: a planner effort-floor + breadth-coverage guard so future plan-mode analyses don't default to shallow.

## Non-Goals

1. No rewrite of the agent runtime event loop.
2. No new config schema surface (no `kind` field on `FileChangeHook` — "lint" is a naming convention only).
3. No removal or re-enabling of graveyarded agents except `git-committer` (explicitly resurrected).
4. No change to the default `idf` lexical scoring in the indexer (stays default + fallback).
5. No hosted backend changes (repo is local-mode only).
6. No change to OAuth flows beyond what prior sessions already shipped.
7. `git_branch` reuses the existing `gitStatus` helper; does not reimplement porcelain parsing.

## Requirements

### M1 — Embedded craftsmanship prompts (foundational)
- R1.1 New `agents/base2/quality-prompt-section.ts` exporting `qualitySection` (DRY/SOLID/clean-code/hygiene/conventions) and `frontendSection` (design + a11y + responsive + perf).
- R1.2 Imported by `base2.ts`, `base-deep.ts`, and the editor's prompt so implementation agents receive craftsmanship guidance directly.
- R1.3 The quality section is byte-frozen by a snapshot test; the frontend section is explicitly *not* byte-frozen (it is the one section allowed to evolve per AC7).

### M2 — Subagent output quality & design
- R2.1 `code-searcher`: add a bounded ≤200-token LLM digest of result themes alongside raw ripgrep output; downgrade model from Sonnet to a cheaper fast model (it's deterministic tool execution).
- R2.2 `file-picker`: rank by relevance (match frequency + path-depth penalty + symbol-name exactness), dedup, return ordered top-N.
- R2.3 `thinker`: accept optional `depth`/`outputSchema` hints; default stays free-text.
- R2.4 `code-reviewer`: 3-item security checklist (path traversal / symlink races / injection) + a coverage-adequacy line.
- R2.5 `editor`: decompose `instructionsPrompt` to import M1's shared sections.
- R2.6 New bundled agents: `test-writer`, `security-reviewer`, `debugger`, `doc-writer` (each a focused, single-purpose agent).
- R2.7 Enforce a `MAX_SPAWN_DEPTH` (default 3) on `spawn_agents` to prevent unbounded subagent recursion.

### M3 — Orchestrator decision logic
- R3.1 Add programmatic parallelism control: when validation is static-only (no runtime dependency), allow validation + reviewer to run concurrently instead of strictly sequential.
- R3.2 Repair-loop escalation: after `MAX_REPAIR_ROUNDS` exhausted, escalate (broaden context / switch model) instead of only blocking; prevent `repairRoundCount` reset-on-edit circumvention by tracking a durable `repairSessionId`.
- R3.3 Adaptive agent spawning guidance in the orchestrator prompt keyed to request breadth (see M10).
- R3.4 `base-deep.ts` gains the same gate lifecycle as `base2.ts` (currently a bare while loop with no validation/reviewer gate).

### M4 — Context & memory management
- R4.1 Runtime-triggered pruning: when `contextTokenCount` exceeds a model-specific threshold in `loopAgentSteps`, automatically spawn `context-pruner` instead of waiting for the model or the crude `getMessagesForModelContext` fallback.
- R4.2 Extend `trimMessagesToFitTokenLimit` to summarize (not drop) large tool results for `code_search`, `read_subtree`, `query_index`, `web_search` — not only `run_terminal_command`.
- R4.3 `contextTokenCount` is currently computed but unused; wire it to the pruning trigger and surface it in the status bar (M9).

### M5 — Git discipline
- R5.1 Extract `gitCommitGuidePrompt` from `common/src/tools/params/tool/run-terminal-command.ts` into `common/src/constants/git-discipline.ts` (single source of truth).
- R5.2 Resurrect `git-committer` from `agents-graveyard/` as a bundled agent (stage related files, draft conventional commit, commit, no push).
- R5.3 Add `git_branch` SDK helper (non-destructive: refuses on dirty tree via reused `gitStatus`).
- R5.4 Add `git_discipline` orchestrator prompt section (feature branches, logical commits, never amend/rebase shared branches, ask before push).

### M6 — Quality gates
- R6.1 `lint` hook convention (naming/prefix only, no schema field) in `fileChangeHooks`.
- R6.2 Pre-edit advisory review for security-sensitive file patterns (before the editor runs, not after).
- R6.3 Coverage-adequacy check in the reviewer verdict contract.
- R6.4 Surface `repairRoundCount`/`MAX_REPAIR_ROUNDS` in the gate-state box visible to the model.

### M7 — Indexing depth
- R7.1 Optional semantic-embedding boost (opt-in; lexical IDF stays default + fallback) layered on the existing scorer in `packages/indexer/src/query.ts`.
- R7.2 Stale-index detection (`staleness` = age + changed-files-since-build) surfaced in `query_index` explain output.
- R7.3 Language coverage: add PHP/Swift/Kotlin config + tag queries; if a tree-sitter WASM grammar is unavailable for a language, that language ships config + tag-query only and structure parsing gracefully no-ops (not blocked).

### M8 — SDK provider layer
- R8.1 **BUGFIX:** Failover is broken whenever agent/defaultModel routing exists — `resolveConfiguredAgentModelConfig` ignores the `failoverModel` param. Fix so configured failover models are actually attempted.
- R8.2 Cost accounting: honor configured `pricing` capability for non-OpenRouter BYOK providers (currently silent).
- R8.3 Unify retry config (`MAX_STREAM_RETRIES=2` in llm.ts vs `MAX_RETRIES_PER_MESSAGE=3` in retry-config.ts) and add jitter to backoff.
- R8.4 Remove dead `sdk/src/tools/run-file-change-hooks.ts` no-op stub (real impl is `tools/file-change-hooks.ts`; stub only lingers in `ToolHelpers`).

### M9 — CLI UX
- R9.1 Command palette (Ctrl+P) for fuzzy slash-command + file execution.
- R9.2 `/diff` and `/changes` commands to view all pending changes in one place.
- R9.3 Status bar: token/cost usage, context-window %, active model name, diff stats.
- R9.4 Undo/redo (the commented-out `/undo` `/redo` in `slash-commands.ts`).
- R9.5 Edit & resend a previous user message (Cursor-style).
- R9.6 "Did you mean" suggestions from the router for unknown slash commands.
- R9.7 Fuzzy/global search across input history (currently per-project up/down only).
- R9.8 diff-viewer: restore hunk headers, add line numbers, per-hunk expand/collapse, side-by-side option.

### M10 — Planner / plan-mode effort floor (meta)
- R10.1 Breadth classifier: detect `broad-audit` requests (enumerated domain count ≥ 3 + breadth marker + no single-file target) vs single-target requests.
- R10.2 Minimum-shard rule: for `broad-audit`, spawn ≥1 (file-picker + code-searcher) pair per enumerated domain, minimum 5 pairs; enforce via the `agents/patterns/audit-codebase.md` pattern + an orchestrator-prompt section.
- R10.3 Coverage matrix: before synthesizing, emit a domain → shard mapping so unsharded subsystems are visible (prevents silent under-coverage).
- R10.4 Surface-not-ignored guard: the planner must enumerate the repo's top-level subsystems and confirm each was either audited or explicitly marked out-of-scope; this is the direct fix for the user's "you didn't look at X" complaint.

## Acceptance Criteria

1. M1: snapshot test passes; `base2.ts`/`base-deep.ts`/editor import the shared sections.
2. M2: code-searcher returns digest; file-picker returns ranked dedup top-N; `MAX_SPAWN_DEPTH` enforced; 4 new agents registered and reachable.
3. M3: validation+reviewer can run in parallel when safe; repair escalation triggers after 3 rounds; `base-deep.ts` runs the full gate.
4. M4: auto-pruning fires at threshold; tool results summarized not dropped; `contextTokenCount` drives the trigger.
5. M5: `gitCommitGuidePrompt` single-sourced; `git-committer` bundled; `git_branch` refuses on dirty tree; prompt section present.
6. M6: lint convention documented; pre-edit advisory runs for sensitive patterns; `repairRoundCount` surfaced.
7. M7: semantic boost opt-in and off-by-default; stale detection in explain; missing-grammar language no-ops.
8. M8: failover actually attempts configured models; BYOK cost accounting works; retry config unified with jitter; dead stub removed.
9. M9: command palette, `/diff`, `/changes`, status-bar usage, undo/redo, edit-resend, did-you-mean, fuzzy history all functional.
10. M10: a broad-audit prompt triggers ≥5 shard pairs, emits a coverage matrix, and enumerates all top-level subsystems with audit/scope disposition.
11. Whole-repo `bun run typecheck` + `bun test` green; code-reviewer gate returns LOOKS_GOOD or NON_BLOCKING.

## Relevant Files / Systems

- Orchestrator: `agents/base2/base2.ts`, `agents/base2/gate-repair.ts`, `agents/base2/gate-reviewer.ts`, `agents/base2/base-deep.ts`
- Runtime: `packages/agent-runtime/src/run-agent-step.ts`, `packages/agent-runtime/src/system-prompt/`
- Context: `agents/context-pruner.ts`, `sdk/src/util/messages.ts`, `sdk/src/util/simplify-tool-results.ts`, `sdk/src/impl/llm.ts`
- Subagents: `agents/code-searcher/`, `agents/file-picker/`, `agents/editor/`, `agents/thinker/`, `agents/reviewer/`, `agents-graveyard/`
- SDK: `sdk/src/impl/llm.ts`, `sdk/src/impl/model-provider.ts`, `common/src/provider-config.ts`, `sdk/src/retry-config.ts`, `sdk/src/tools/git-status.ts`, `sdk/src/tools/file-change-hooks.ts`, `sdk/src/tools/run-file-change-hooks.ts` (dead)
- CLI: `cli/src/commands/`, `cli/src/components/`, `cli/src/data/slash-commands.ts`, `cli/src/hooks/`
- Indexer: `packages/indexer/src/query.ts`, `packages/code-map/`
- Planner: `agents/patterns/audit-codebase.md`, orchestrator prompt in `agents/base2/base2.ts`

## Out of Scope

1. Hosted backend (removed in prior sessions).
2. New `FileChangeHook.kind` schema field.
3. Re-enabling graveyarded best-of-n / implementation-planner (separate decision).
4. Replacing the default lexical IDF scorer.
5. Reimplementing git porcelain parsing in `git_branch`.
6. OAuth provider additions.
7. Changing the agent runtime event-loop architecture.