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

- `cli/`: TUI client (OpenTUI + React) and local UX
- `sdk/`: JS/TS SDK used by the CLI and external users
- `web/`: Next.js app + API routes (the “web API”)
- `packages/agent-runtime/`: agent runtime + tool handling (server-side)
- `common/`: shared types, tools, schemas, utilities
- `agents/`: main agents shipped with codebuff
- `.agents/`: local agent templates (prompt + programmatic agents)

## Request Flow

1. CLI/SDK sends user input + context to the Codebuff web API.
2. Agent runtime streams events/chunks back through SDK callbacks.
3. Tools execute locally (file edits, terminal commands, search) to satisfy tool calls.

## Development

Start everything:

```bash
bun dev
```

Or run services + CLI separately:

```bash
bun up
bun start-cli
bun ps
bun down
```

Worktrees (run multiple stacks on different ports): create `.env.development.local`:

```bash
PORT=3001
NEXT_PUBLIC_WEB_PORT=3001
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:3001
```

Logs: `debug/console/` (`db.log`, `studio.log`, `sdk.log`, `web.log`).

Package management:

- Use `bun install`, `bun run ...` (avoid `npm`).

## Agents And Tools

Agents:

- Prompt/programmatic agents live in `.agents/` (programmatic agents use `handleSteps` generators).
- Generator functions execute in a sandbox; agent templates define tool access and subagents.

Shell shims (direct commands without `codebuff` prefix):

```bash
codebuff shims install codebuff/base-lite@1.0.0
eval "$(codebuff shims env)"
base-lite "fix this bug"
```

Tools:

- Tool definitions live in `common/src/tools` and are executed via the SDK helpers + agent-runtime.

## Git Safety Rules

- Never force-push `main` unless explicitly requested.
- To exclude files from a commit: stage only what you want (`git add <paths>`). Never use `git restore`/`git checkout HEAD -- <file>` to “uncommit” changes.
- Run interactive git commands in tmux (anything that opens an editor or prompts).

## Error Handling

Prefer `ErrorOr<T>` return values (`success(...)`/`failure(...)` in `common/src/util/error.ts`) over throwing.

## Testing

- Prefer dependency injection over module mocking; define contracts in `common/src/types/contracts/`.
- Use `spyOn()` only for globals / legacy seams.
- Avoid `mock.module()` for functions; use `@codebuff/common/testing/mock-modules.ts` helpers for constants only.

CLI hook testing note: React 19 + Bun + RTL `renderHook()` is unreliable; prefer integration tests via components for hook behavior.

### CLI tmux Testing

For testing CLI behavior via tmux, use the helper scripts in `scripts/tmux/`. These handle bracketed paste mode and session logging automatically. Session data is saved to `debug/tmux-sessions/` in YAML format and can be viewed with `bun scripts/tmux/tmux-viewer/index.tsx`. See `scripts/tmux/README.md` for details.

## Environment Variables

Quick rules:

- Public client env: `NEXT_PUBLIC_*` only, validated in `common/src/env-schema.ts` (used via `@codebuff/common/env`).
- Server secrets: validated in `packages/internal/src/env-schema.ts` (used via `@codebuff/internal/env`).
- Runtime/OS env: pass typed snapshots instead of reading `process.env` throughout the codebase.

Env DI helpers:

- Base contracts: `common/src/types/contracts/env.ts` (`BaseEnv`, `BaseCiEnv`, `ClientEnv`, `CiEnv`)
- Helpers: `common/src/env-process.ts`, `common/src/env-ci.ts`
- Test helpers: `common/src/testing-env-process.ts`, `common/src/testing-env-ci.ts`
- CLI: `cli/src/utils/env.ts` (`getCliEnv`)
- CLI test helpers: `cli/src/testing/env.ts` (`createTestCliEnv`)
- SDK: `sdk/src/env.ts` (`getSdkEnv`)
- SDK test helpers: `sdk/src/testing/env.ts` (`createTestSdkEnv`)

Bun loads (highest precedence last):

- `.env.local` (Infisical-synced secrets, gitignored)
- `.env.development.local` (worktree overrides like ports, gitignored)

Releases: release scripts read `CODEBUFF_GITHUB_TOKEN`.

## Database Migrations

Edit schema using Drizzle’s TS DSL (don’t hand-write migration SQL), then run the internal DB scripts to generate/apply migrations.

## Referral System

Referral codes are applied via the CLI (web onboarding only instructs the user); see `web/src/app/api/referrals/helpers.ts`.

## Hippo Memory System

Hippo is a persistent memory system for AI agents. It stores interactions, discovers relationships, and lets you recall prior work across sessions.

### RULE 1: Search Hippo FIRST

Before reading files, planning, or writing code — search Hippo:

```bash
~/Programming/hippo/build/hippo search '<what the user is asking about>' --limit 10
```

Hippo may already have analysis, decisions, or dead ends from prior sessions.

### RULE 2: Store to Hippo AFTER every response

After every assistant response — not just task completions:

```bash
~/Programming/hippo/build/hippo store \
  --agent codebuff \
  --session '<descriptive-session-id>' \
  --input '<what happened — 1-2 sentences>' \
  --output '<DETAILED: what you read, decided, changed, and WHY>' \
  --concepts 'topic1,topic2' \
  --outcome success
```

Valid outcomes: success, failure, partial, decision, discovery, recall, blocked

### RULE 3: Use ONLY the CLI

Do NOT use the hippo-memory MCP sub-agent — it is unreliable. Always use the hippo CLI via the commander agent with rawOutput: true.

### Quick Reference

| Operation | Command |
|-----------|----------|
| Search memory (STEP ZERO!) | `~/Programming/hippo/build/hippo search '<query>' --limit 10` |
| Store a run (AFTER EVERY RESPONSE!) | `~/Programming/hippo/build/hippo store --agent <name> --session '<id>' ...` |
| Get semantic context | `~/Programming/hippo/build/hippo context '<query>' --max-tokens 4000` |
| Get recent snapshot | `~/Programming/hippo/build/hippo snapshot --limit 5 --short` |
| List sessions | `~/Programming/hippo/build/hippo sessions --limit 10` |
| Show stats | `~/Programming/hippo/build/hippo stats` |

### Store Metadata Flags

- `--concepts` (Always): e.g., 'auth,security,API'
- `--outcome` (Always): success, failure, decision, discovery
- `--files-changed` (Edits): e.g., 'foo.go,bar.go'
- `--files-read` (Reading): e.g., 'service.go,types.go'
- `--commands-run` (Commands): e.g., 'make test,make lint'

### The --output Field Must Be DETAILED

BAD: 'Fixed the bug and deleted the file.'

GOOD: 'Analyzed STM usage across 3 files: service.go (write-through cache), recall.go (GetRecent), retrieval.go (tier boost). Removed all 3 usages. Replaced tier boost with recency boost. All tests pass.'

### Feeding Context to Sub-Agents

Sub-agents (editors, reviewers, opus) are stateless — they cannot see conversation history or call Hippo. Before spawning them:

1. Search Hippo: `~/Programming/hippo/build/hippo context '<topic>' --max-tokens 4000`
2. Include results in the sub-agent prompt under: `## Prior work from Hippo memory:`
