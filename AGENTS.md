# Openbuff

Openbuff is a local-first, BYOK-only coding CLI and SDK with a composable agent framework.

## Goal

Make an efficient learning agent that can do anything.

## Key Technologies

- TypeScript monorepo (Bun workspaces)
- Bun runtime + package manager
- Multiple user-configured LLM providers (Anthropic/OpenAI/Gemini/OpenAI-compatible/etc.)

## Repo Map

- `cli/` — TUI client (OpenTUI + React) and local UX
- `sdk/` — JS/TS SDK used by the CLI and external users
- `packages/agent-runtime/` — agent runtime + tool handling
- `packages/indexer/` — codebase indexing/retrieval backend (`query_index`)
- `packages/code-map/` — code-graph construction and symbol mapping
- `packages/internal/` — internal utilities shared across runtime packages
- `common/` — shared types, tools, schemas, utilities
- `agents/` — main agents shipped with openbuff
- `.agents/` — local agent templates (prompt + programmatic agents)
- `evals/` — evaluation framework and benchmarks

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux (anything that opens an editor or prompts).
- Prefer retrieval-led context gathering: start broad codebase tasks with `query_index`, then verify selected files with `read_files`/`read_subtree` before editing.
- `query_index` supports graph-aware modes: `search`, `explain`, `neighbors`, `path`, and `references`, plus `commands` for package scripts, CI workflows, task runners, and validation docs. Use `relatedFiles`, `matchedSnippets`, and explanations to find adjacent implementation, test, type, or command files.
- **Broad / audit-style requests — scope first, then shard.** For any "audit", "review for X across the codebase", "find all the places…", "what can be improved in the agents/sdk/cli", or other open-ended requests whose surface is not already obvious: do NOT default to a single `code_search` or a couple of `read_files`. Read `agents/patterns/audit-codebase.md` and follow its scope-then-shard flow (the adaptive shard-count rubric, 8-domain checklist, and synthesized coverage matrix live there — keep that file as the source of truth rather than duplicating it here). In brief: measure breadth (`query_index` `search`+`commands`, `list_directory`, `glob`), spawn shards in parallel, write findings to `.agents/sessions/<slug>/findings/*.md` (NOT in `set_output` — pruner eats it), ensure every top-level dir is audited or explicitly marked out-of-scope, then synthesize. Treat "audit" as externally judged — breadth is a verifiable success criterion (shard count, subsystem enumeration, coverage report), not inferred. Companion machinery: `classifyBreadth` / `evaluateMinimumShardRule` in `evals/buffbench/plan-sharding-signals.ts`; orchestrator instruction in `agents/base2/quality-prompt-section.ts`; pattern index in `agents/patterns/INDEX.md`.

## Docs

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning. Always read the relevant docs below before implementing changes.

- `docs/architecture.md` — Package dependency graph, per-package details, architectural patterns, handleSteps generator lifecycle
- `docs/request-flow.md` — Full local/BYOK request lifecycle from CLI through SDK/runtime to provider and back
- `docs/local-mode.md` — Local provider configuration and BYOK routing rules
- `docs/development.md` — Dev setup, worktrees, logs, package management, DB migrations
- `docs/testing.md` — DI over mocking, tmux CLI testing
- `docs/environment-variables.md` — Env var rules, DI helpers, loading order
- `docs/agents-and-tools.md` — Agent system, shell shims, tool definitions
