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
- `common/` — shared types, tools, schemas, utilities
- `agents/` — main agents shipped with openbuff
- `.agents/` — local agent templates (prompt + programmatic agents)

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux (anything that opens an editor or prompts).
- Prefer retrieval-led context gathering: start broad codebase tasks with `query_index`, then verify selected files with `read_files`/`read_subtree` before editing.
- `query_index` supports graph-aware modes: `search`, `explain`, `neighbors`, and `path`, plus `commands` for package scripts, CI workflows, task runners, and validation docs. Use `relatedFiles`, `matchedSnippets`, and explanations to find adjacent implementation, test, type, or command files.

## Docs

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning. Always read the relevant docs below before implementing changes.

- `docs/architecture.md` — Package dependency graph, per-package details, architectural patterns, handleSteps generator lifecycle
- `docs/request-flow.md` — Full local/BYOK request lifecycle from CLI through SDK/runtime to provider and back
- `docs/local-mode.md` — Local provider configuration and BYOK routing rules
- `docs/development.md` — Dev setup, worktrees, logs, package management, DB migrations
- `docs/testing.md` — DI over mocking, tmux CLI testing
- `docs/environment-variables.md` — Env var rules, DI helpers, loading order
- `docs/agents-and-tools.md` — Agent system, shell shims, tool definitions
