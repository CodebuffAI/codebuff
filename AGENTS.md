# Freebuff

Freebuff is the public, free coding agent built from the Codebuff agent framework.

## Key Technologies

- TypeScript monorepo
- Bun runtime and package manager
- OpenTUI + React CLI
- JS/TS SDK
- Composable agent runtime

## Repo Map

- `cli/` - TUI client and local UX
- `sdk/` - JS/TS SDK used by the CLI and external users
- `common/` - shared types, tools, schemas, and utilities
- `agents/` - public agent definitions
- `packages/agent-runtime/` - agent runtime and tool handling
- `packages/code-map/` - source parsing helpers
- `packages/llm-providers/` - public LLM provider shims
- `freebuff/` - Freebuff CLI, release files, and e2e tests
- `scripts/tmux/` - tmux helpers for CLI testing

## Conventions

- Use `bun install` and `bun run`.
- Prefer dependency injection over module mocking.
- Run interactive CLI tests in tmux.
- Do not force-push `main`.

## Docs

- `docs/agents-and-tools.md`
- `docs/testing.md`
