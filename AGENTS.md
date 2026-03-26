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
- `evalbuff/` — automated docs optimization loop (run agent → judge → analyze → improve docs)

## Request Flow

1. CLI/SDK sends user input + context to the Codebuff web API.
2. Agent runtime streams events/chunks back through SDK callbacks.
3. Tools execute locally (file edits, terminal commands, search) to satisfy tool calls.

## Conventions

- Prefer `ErrorOr<T>` return values (`success(...)`/`failure(...)` in `common/src/util/error.ts`) over throwing.
- Never force-push `main` unless explicitly requested.
- To exclude files from a commit: stage only what you want (`git add <paths>`). Never use `git restore`/`git checkout HEAD -- <file>` to "uncommit" changes.
- Run interactive git commands in tmux (anything that opens an editor or prompts).
- Referral codes are applied via the CLI (web onboarding only instructs the user); see `web/src/app/api/referrals/helpers.ts`.

## Docs

- [`docs/architecture.md`](docs/architecture.md) — Package dependency graph, per-package details, architectural patterns
- [`docs/request-flow.md`](docs/request-flow.md) — Full request lifecycle from CLI through server and back
- [`docs/error-schema.md`](docs/error-schema.md) — Server error response formats and client-side handling
- [`docs/development.md`](docs/development.md) — Dev setup, worktrees, logs, package management, DB migrations
- [`docs/testing.md`](docs/testing.md) — DI over mocking, tmux CLI testing
- [`docs/environment-variables.md`](docs/environment-variables.md) — Env var rules, DI helpers, loading order
- [`docs/agents-and-tools.md`](docs/agents-and-tools.md) — Agent system, shell shims, tool definitions
- [`docs/patterns/handle-steps-generators.md`](docs/patterns/handle-steps-generators.md) — handleSteps generator patterns and spawn_agents tool calls
