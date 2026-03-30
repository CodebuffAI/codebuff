# Codebuff

Codebuff is an advanced coding agent with a composable agent framework. It also includes:
- freebuff, the free coding agent
- evalbuff, a project to improve an agent through evals

## Goal

Make an efficient learning agent that can do anything.

## Key Technologies

- TypeScript monorepo (Bun workspaces)
- Bun runtime + package manager
- Next.js (web app + API routes)
- Multiple LLM providers (Anthropic/OpenAI/Gemini/etc.)

## Repo Map

- `cli/` — TUI client (OpenTUI + React) and local UX
- `sdk/` — JS/TS SDK used by the CLI and external users
- `web/` — Next.js app + API routes (the "web API")
- `packages/agent-runtime/` — agent runtime + tool handling (server-side)
- `common/` — shared types, tools, schemas, utilities
- `agents/` — main agents shipped with codebuff
- `.agents/` — local agent templates (prompt + programmatic agents)
- `freebuff/` - a free coding agent built from configuring codebuff cli
- `evalbuff/` — automated docs optimization loop (run agent → judge → analyze → improve docs)

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux (anything that opens an editor or prompts).

## Docs

- [`docs/architecture.md`](docs/architecture.md) — Package dependency graph, per-package details, architectural patterns
- [`docs/request-flow.md`](docs/request-flow.md) — Full request lifecycle from CLI through server and back
- [`docs/error-schema.md`](docs/error-schema.md) — Server error response formats and client-side handling
- [`docs/development.md`](docs/development.md) — Dev setup, worktrees, logs, package management, DB migrations
- [`docs/testing.md`](docs/testing.md) — DI over mocking, tmux CLI testing
- [`docs/environment-variables.md`](docs/environment-variables.md) — Env var rules, DI helpers, loading order
- [`docs/agents-and-tools.md`](docs/agents-and-tools.md) — Agent system, shell shims, tool definitions
- [`docs/patterns/handle-steps-generators.md`](docs/patterns/handle-steps-generators.md) — handleSteps generator patterns and spawn_agents tool calls
- [docs/evalbuff/interpreting-task-prompts.md](docs/evalbuff/interpreting-task-prompts.md)
- [docs/patterns/discover-before-implement.md](docs/patterns/discover-before-implement.md)
