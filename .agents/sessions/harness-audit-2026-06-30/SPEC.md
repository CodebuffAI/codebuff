# Harness Audit — SPEC

## Overview
Comprehensive audit of every layer of the Openbuff "harness" — the machinery that turns a user prompt into LLM calls, tool executions, and rendered output — surfacing concrete improvements across correctness, security, performance, state mutation, error handling, dependency hygiene, test coverage, and API/ABI contracts. Output is a single cross-cutting `AUDIT-REPORT.md` plus per-shard finding files under `.agents/sessions/harness-audit-2026-06-30/findings/`.

## What counts as "the harness"
The harness is the full request → response pipeline plus the orchestration scaffolding around it. For this audit it spans:

1. **Agent definitions** — `agents/` (base2 family, gate-reviewer, gate-files, gate-state, gate-repair, base-deep, file-explorer, editor, reviewer, thinker, researcher, debugger, context-pruner, basher, tmux-cli, security-reviewer, doc-writer, test-writer, git-committer, synthesizer, librarian, browser-use, general-agent, patterns/).
2. **Agent runtime** — `packages/agent-runtime/src/` (run-agent-step, main-prompt, run-programmatic-step, prompt-agent-stream, tool-stream-parser, process-str-replace, process-file-block, process-structured-edit, process-edit-transaction, structural-read, tools/handlers/**, system-prompt/**, util/** including context-pruning, token-counter, budget-enforcement, background-agent-jobs, render-read-files-result, preflight-syntax-validation).
3. **SDK** — `sdk/src/` (client, run, run-state, provider-config, model-discovery, credentials, retry-config, custom-tool, validate-agents, tools/, impl/llm, impl/failover, impl/model-provider, impl/agent-runtime, impl/chatgpt-backend-fetch).
4. **CLI / TUI** — `cli/src/` (chat.tsx, app.tsx, hooks/use-send-message, use-chat-streaming, use-chat-keyboard, use-suggestion-engine, components/status-bar, command-palette-screen, review-screen, plan-session-picker-screen, model-route-picker, etc.).
5. **Common / shared** — `common/src/` (types, schemas, tools, constants, utils, templates).
6. **Indexing & code-map** — `packages/indexer/`, `packages/code-map/`.
7. **Evals harness** — `evals/buffbench/` (agent-runner, judge, plan-sharding-signals, deterministic-signals, lessons-extractor).
8. **Scripts / guards** — `scripts/` (build-structural-map, memory-drift-guard, byok-wording-guard, generate-tool-definitions, sync-agent-config, check-tool-registration, openbuff-smoke).
9. **Runtime config surface** — `openbuff.d/` (routes.json, providers.json, indexing.json, hooks.json) and `openbuff.json`.
10. **Documentation** — `docs/` (architecture, request-flow, deterministic-edit-system, agents-and-tools, local-mode, configuration, environment-variables, authentication, testing, development) — audited for drift against the code it documents, not for prose quality.

## Goals
- Identify concrete, file:line-level improvements across all 8 audit domains (security, correctness, state mutation, error handling, performance, dependency hygiene, test coverage, API/ABI contracts) in every harness subsystem above.
- Produce a deduplicated, severity-ranked report with a **Top 10** highest-leverage fixes and a **Cross-cutting** section for systemic patterns (the most valuable category for harness improvements).
- Cover every subsystem explicitly — either via a shard pair or an explicit out-of-scope mark — so the user is never told "you didn't look at X" after the fact.
- Leave the codebase untouched. This is an audit; fixes are follow-up work scoped from the report.

## Non-goals
- No code changes in this plan session. Any fix that surfaces from the audit becomes its own follow-up task.
- No prose-quality / style-only documentation rewrite. Docs are audited only for drift against the code they describe.
- No benchmark runs (buffbench) — those are expensive and out of scope for a static audit. Performance findings are static-analysis only (hot paths, complexity, unnecessary I/O, etc.).
- No external dependency upgrades. Dependency hygiene findings are reported but not applied.
- No reorganization of the patterns library or session-artifact format.

## Requirements (R*)
- **R1 — Structural map first.** Build `.agents/sessions/harness-audit-2026-06-30/MAP.md` via `scripts/build-structural-map.ts` with the `--check-stale` pre-flight, then pin it. Shards navigate from the map; they do not re-discover structure.
- **R2 — Shard pairs per subsystem.** Each subsystem shard MUST be covered by a file-picker + code-searcher **pair** (per `agents/patterns/audit-codebase.md` minimum-shard rule). Minimum total pairs ≥ 5 for a broad-audit; this audit will provision ≥ 9 pairs to match the breadth.
- **R3 — Findings on disk, not in messages.** Every shard writes to `findings/<shard>.md` using the exact severity/risk/fix/evidence format from the pattern. Empty findings files are valid and must still be written.
- **R4 — 8 audit domains per shard.** Each shard evaluates its files against ALL 8 domains: Security, Correctness, State mutation, Error handling, Performance, Dependency hygiene, Test coverage gaps, API/ABI contract breaks. A shard that does not consider a domain must say so explicitly.
- **R5 — Coverage matrix.** Before synthesis, emit `COVERAGE-MATRIX.md` listing every domain × shard mapping and a `## Subsystem enumeration` section that marks every top-level dir as `audited` or `out-of-scope` with a one-line reason.
- **R6 — Synthesize, don't re-audit.** The synthesizer reads ONLY finding files + the coverage matrix to produce `AUDIT-REPORT.md`. It never re-reads raw source.
- **R7 — Report contract.** `AUDIT-REPORT.md` must contain: Top 10 highest-leverage fixes (with file:line), per-domain sections sorted by severity, a Cross-cutting findings section, and a Coverage section referencing the matrix.
- **R8 — No source mutation.** The audit produces only files under `.agents/sessions/harness-audit-2026-06-30/`. No edits to project source, agents, configs, or docs in this session.

## Audit domains (verbatim from `agents/patterns/audit-codebase.md`)
1. **Security** — injection, authn/authz bypass, secret leakage, path traversal, unsafe deserialization, SSRF, missing input validation, over-permissive CORS/cookies, prompt-injection surfaces.
2. **Correctness** — logic errors, off-by-one, wrong operator, race conditions, incorrect error propagation, broken invariants, misused APIs, type assertions that hide bugs.
3. **State mutation** — unguarded shared mutable state, stale closures, missing transaction boundaries, cache-invalidation gaps, leaked background jobs/AbortSignals, double-frees, order-of-init bugs.
4. **Error handling** — swallowed errors, `catch {}` that hides failures, missing retries where required, retries without backoff, error messages that leak internals, unhandled promise rejections, missing timeouts on I/O.
5. **Performance** — O(n²) in a hot path, unnecessary clones, serial I/O that could be parallel, missing pagination, unbounded memory growth, redundant re-renders, N+1 queries.
6. **Dependency hygiene** — pinned vs floating versions, unused deps, dup deps, known-vulnerable versions, deps used without being declared, dev deps shipped to runtime.
7. **Test coverage gaps** — critical paths with no test, tests that don't assert the failure mode, flaky-test patterns, missing error-path tests, tests that mock too much.
8. **API/ABI contract breaks** — exported signature changes, removed exports, changed error shapes, breaking config/schema changes, changed CLI flags/env vars, changed event payloads.

## Harness-specific risk hotspots (priors)
Reviewers should *especially* look for these patterns in the listed subsystems — they're known weak spots in this codebase based on recent change history:

- **Agent runtime — staged read-before-edit & basedOnRead lifecycle.** `process-str-replace.ts`, `process-edit-transaction.ts`, `structural-read.ts`, `tools/handlers/tool/read-files.ts`, `util/render-read-files-result.ts`. Look for races between read-mint and edit-consume, drift between hash format (`sha256:<hash>:<byteLength>`) and consumers, capabilities that outlive their read, and stale-anchor recovery loops that don't actually invalidate.
- **Gate lifecycle parity across base2 / base-deep / base2-execute-plan / base2-fast-no-validation.** Gate-state markers, repair-loop escalation, MAX_REPAIR_ROUNDS, durable repairSessionId, `<gate-state>` block contract. Drift here = the user-visible gate contract silently breaks.
- **Context pruning trigger & message trimming.** `util/context-pruning.ts`, `util/token-counter.ts`, `util/budget-enforcement.ts`, `util/simplify-tool-results.ts`. Look for under-counting (prune fires too late), over-counting (prune fires too often), and tool-result summarizers that drop information needed for the next step.
- **SDK failover / retry / cost accounting.** `sdk/src/impl/failover.ts`, `sdk/src/retry-config.ts`, `sdk/src/impl/llm.ts`, `sdk/src/impl/model-provider.ts`. Look for retries without jitter, failover lists with duplicate models, BYOK pricing capability mis-resolution, and dropped abort signals.
- **CLI streaming & abort.** `cli/src/hooks/use-chat-streaming.ts`, `cli/src/hooks/use-send-message.ts`, `cli/src/hooks/helpers/send-message.ts`. Look for AbortController leaks across messages, stale-closure reads of session state, and re-render storms from batched updaters.
- **Tool registry drift.** `scripts/check-tool-registration.ts`, `scripts/generate-tool-definitions.ts`, `openbuff.d/routes.json`, `openbuff.d/providers.json`, `openbuff.d/indexing.json`, `openbuff.d/hooks.json`. Look for tool params mismatched between Zod schemas, handler signatures, CLI renderers, and route entries.
- **Background-agent job lifecycle.** `util/background-agent-jobs.ts`, `tools/handlers/tool/check-job.ts`, `tools/handlers/tool/kill-job.ts`, `tools/handlers/tool/read-logs.ts`. Look for orphaned jobs, missing SIGTERM-on-timeout, and read-offset drift across `check_job` polls.
- **Indexer freshness.** `packages/indexer/` and `query_index` tool. Look for stale indexes mis-ranking files, missing invalidation on file mutation, and `mode: 'commands'` index entries that don't reflect current package scripts.
- **Eval harness signals.** `evals/buffbench/plan-sharding-signals.ts`, `deterministic-signals.ts`, `analyze-task-scores.ts`. Look for signal extractors that don't match current planner output (the M10.* milestones recently changed the broad-audit contract).
- **Memory-drift guard & byok-wording guard.** `scripts/memory-drift-guard.ts`, `scripts/byok-wording-guard.ts`. Look for false-negative skips, hardcoded sentinel literals that drift, and execSync→execFileSync gaps.

## Acceptance criteria
- `.agents/sessions/harness-audit-2026-06-30/MAP.md` exists and is fresh (built or verified within the session).
- `findings/<shard>.md` exists for every shard, with the per-finding format from the pattern; empty files are valid.
- `COVERAGE-MATRIX.md` lists every domain × shard mapping AND every top-level dir disposition (audited or out-of-scope).
- `AUDIT-REPORT.md` contains a Top 10 with file:line, per-domain sections sorted by severity, a Cross-cutting section, and a Coverage section referencing the matrix.
- No project source / agent / config / doc files were modified by this session.

## Relevant files (entry points for shards)
- Agent runtime entry: `packages/agent-runtime/src/run-agent-step.ts`, `main-prompt.ts`.
- SDK entry: `sdk/src/run.ts`, `sdk/src/client.ts`, `sdk/src/impl/llm.ts`, `sdk/src/impl/failover.ts`.
- CLI entry: `cli/src/chat.tsx`, `cli/src/hooks/use-send-message.ts`, `cli/src/hooks/use-chat-streaming.ts`.
- Gate machinery: `agents/base2/gate-reviewer.ts`, `gate-state.ts`, `gate-repair.ts`, `gate-files.ts`, `gate-paths.ts`, `base2.ts`, `base-deep.ts`.
- Deterministic edits: `packages/agent-runtime/src/process-str-replace.ts`, `process-edit-transaction.ts`, `structural-read.ts`, `tools/handlers/tool/read-files.ts`.
- Context management: `packages/agent-runtime/src/util/context-pruning.ts`, `token-counter.ts`, `budget-enforcement.ts`, `simplify-tool-results.ts`.
- Tool registry: `packages/agent-runtime/src/tools/handlers/list.ts`, `scripts/check-tool-registration.ts`, `scripts/generate-tool-definitions.ts`, `openbuff.d/routes.json`.
- Guards: `scripts/memory-drift-guard.ts`, `scripts/byok-wording-guard.ts`.
- Pattern reference: `agents/patterns/audit-codebase.md`.
