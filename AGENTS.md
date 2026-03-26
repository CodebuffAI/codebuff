# Codebuff

Codebuff is a tool for editing codebases via natural-language instructions to Buffy (an expert AI programming assistant).

## Goals

- Make expert engineers faster (power-user focus).
- Reduce time/effort for common programming tasks.
- Improve via iteration/feedback (learn/adapt from usage).

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

## Docs

- [`docs/architecture.md`](docs/architecture.md) — Package dependency graph, per-package details, key architectural patterns
- [`docs/request-flow.md`](docs/request-flow.md) — Full request lifecycle from CLI through server and back
- [`docs/error-schema.md`](docs/error-schema.md) — Server error response formats and client-side handling
- [`docs/error-handling.md`](docs/error-handling.md) — ErrorOr pattern for return values
- [`docs/development.md`](docs/development.md) — Dev setup, worktrees, logs, package management, DB migrations
- [`docs/testing.md`](docs/testing.md) — Testing conventions, DI over mocking, tmux CLI testing
- [`docs/environment-variables.md`](docs/environment-variables.md) — Env var rules, DI helpers, loading order
- [`docs/agents-and-tools.md`](docs/agents-and-tools.md) — Agent system, shell shims, tool definitions, referral system
- [`docs/git-guidelines.md`](docs/git-guidelines.md) — Git safety rules
