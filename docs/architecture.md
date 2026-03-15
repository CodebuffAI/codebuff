# Architecture Overview

Codebuff is a TypeScript monorepo (Bun workspaces) that provides an AI-powered coding assistant via a CLI, SDK, and web API.

## Package Dependency Graph

```
                                  ┌──────────┐
                                  │   cli/   │  TUI client (OpenTUI + React)
                                  └────┬─────┘
                                       │
                                  ┌────▼─────┐
                          ┌───────│   sdk/   │  JS/TS SDK
                          │       └────┬─────┘
                          │            │
                  ┌───────▼────────┐   │
                  │ agent-runtime/ │◄──┘  Agent execution engine
                  └───────┬────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
    ┌─────▼─────┐   ┌─────▼─────┐   ┌─────▼─────┐
    │  agents/  │   │  common/  │   │ internal/ │
    └───────────┘   └─────┬─────┘   └─────┬─────┘
                          │               │
                    ┌─────┼─────┐   ┌─────┼─────────┐
                    │     │     │   │     │         │
               billing/ bigquery/ code-map/    web/
```

## Packages

### `cli/` — TUI Client

The user-facing terminal UI, built with [OpenTUI](https://github.com/nickhudkins/opentui) (a React renderer for terminals) and React hooks.

- **Entry point:** `src/index.tsx` → `src/app.tsx` → `src/chat.tsx`
- **Key responsibilities:**
  - Renders the chat interface, agent output, tool call results, and status indicators
  - Manages user input, slash commands (`/help`, `/usage`), and agent mode selection (DEFAULT, MAX, PLAN)
  - Handles authentication (login polling, OAuth), session persistence, and chat history
  - Calls `client.run()` from the SDK and processes streaming events
- **Depends on:** `sdk`, `common`

### `sdk/` — JavaScript/TypeScript SDK

The public SDK used by the CLI and available to external users via `@codebuff/sdk` on npm.

- **Entry point:** `src/client.ts` (`CodebuffClient`) → `src/run.ts` (`run()`)
- **Key responsibilities:**
  - Orchestrates agent runs: initializes session state, registers tool handlers, calls `callMainPrompt()`
  - **Executes tool calls locally** on the user's machine (file edits, terminal commands, code search)
  - Manages model provider selection: Claude OAuth, ChatGPT OAuth, or Codebuff backend
  - Handles credentials, retry logic, and error transformation
- **Depends on:** `agent-runtime`, `common`, `internal` (for OpenAI-compatible provider)

### `packages/agent-runtime/` — Agent Execution Engine

The core agent loop that drives LLM inference, tool execution, and multi-step reasoning.

- **Entry point:** `src/main-prompt.ts` → `src/run-agent-step.ts` (`loopAgentSteps()`)
- **Key responsibilities:**
  - Runs the agent loop: LLM call → process response → execute tool calls → repeat
  - Manages agent templates, system prompts, and tool definitions
  - Handles subagent spawning, programmatic agent steps (`handleSteps` generators)
  - Processes the AI SDK stream (`streamText()`) and routes tool calls to the SDK
  - Manages context token counting, cache debugging, and cost tracking
- **Depends on:** `common`, `agents` (for agent templates)

### `common/` — Shared Library

Shared types, utilities, constants, and tool definitions used across the entire monorepo.

- **Key areas:**
  - `src/types/` — TypeScript types: `SessionState`, `AgentOutput`, `Message`, contracts for DI
  - `src/tools/` — Tool parameter schemas (Zod), tool names, and tool call validation
  - `src/constants/` — Model configs, agent IDs, OAuth settings, billing constants
  - `src/util/` — Error handling (`ErrorOr<T>`), message utilities, string helpers, XML parsing
  - `src/templates/` — Agent definition types, initial `.agents/` directory template
  - `src/testing/` — Mock factories for database, filesystem, analytics, fetch, timers
- **Depends on:** nothing (leaf package)

### `agents/` — Agent Definitions

Prompt-based and programmatic agent definitions that ship with Codebuff.

- **Key agents:**
  - `base2/` — The default agent (base2, base2-max, base2-free, base2-plan)
  - `editor/` — Code editing specialist with best-of-N selection
  - `file-explorer/` — File picker, code searcher, directory lister, glob matcher
  - `thinker/` — Deep reasoning agent with best-of-N variants
  - `reviewer/` — Code review agent with multi-prompt variant
  - `researcher/` — Web search and docs search agents
  - `general-agent/` — General-purpose agents (opus-agent, gpt-5-agent)
  - `basher.ts` — Terminal command execution agent (id: 'basher', displayName: 'Basher')
  - `context-pruner.ts` — Conversation summarization to manage context length
- **Depends on:** `common` (for agent definition types and tool params)

### `web/` — Next.js Web Application

The Codebuff web server, marketing site, and API.

- **Key areas:**
  - `src/app/api/v1/chat/completions/` — The main LLM proxy endpoint (routes to OpenRouter, Fireworks, OpenAI)
  - `src/app/api/v1/` — REST API: agent runs, feedback, usage, web search, docs search, token count
  - `src/app/api/auth/` — NextAuth.js authentication (GitHub OAuth)
  - `src/app/api/stripe/` — Billing: credit purchases, subscriptions, webhooks
  - `src/app/api/agents/` — Agent registry: publish, validate, fetch
  - `src/app/api/orgs/` — Organization management: teams, billing, repos
  - `src/app/` — Marketing pages, docs (MDX via contentlayer), user profile, pricing
  - `src/llm-api/` — LLM provider integrations (OpenRouter, Fireworks, OpenAI, SiliconFlow, CanopyWave)
- **Depends on:** `common`, `internal`, `billing`, `bigquery`

### `packages/internal/` — Internal Utilities

Server-side utilities, database schema, and vendor forks shared between `web` and `sdk`.

- **Key areas:**
  - `src/db/` — Drizzle ORM schema (`schema.ts`), migrations, Docker Compose for local Postgres
  - `src/env.ts` — Server environment variable validation (@t3-oss/env-nextjs)
  - `src/loops/` — Loops email service integration (transactional emails)
  - `src/openai-compatible/` — Forked OpenAI-compatible AI SDK provider (used by the SDK to call the Codebuff backend)
  - `src/openrouter-ai-sdk/` — Forked OpenRouter AI SDK provider (used by the web server)
  - `src/templates/` — Agent template fetching and validation
- **Depends on:** `common`

### `packages/billing/` — Billing & Credits

Credit management, subscription handling, and usage tracking.

- **Key components:**
  - `balance-calculator.ts` — Credit balance calculation (free, purchased, rollover, subscription grants)
  - `subscription.ts` — Subscription plan management, block grants, weekly limits
  - `grant-credits.ts` — Credit grant operations (referral, purchase, admin, free)
  - `auto-topup.ts` — Automatic credit purchases when balance is low
  - `usage-service.ts` — Usage data aggregation
  - `credit-delegation.ts` — Organization credit delegation
- **Depends on:** `common` (for DB access, Stripe utils, types)

### `packages/bigquery/` — Analytics Data

Google BigQuery integration for storing agent interaction traces and usage analytics.

- **Tables:** `traces` (agent interactions), `relabels` (fine-tuning relabeling data)
- **Trace types:** file selection calls, file trees, agent responses, training data, model grading
- **Depends on:** `common`

### `packages/code-map/` — Code Parsing

Tree-sitter based source code parser that extracts function/variable names for file tree display.

- **Supports:** TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP
- **Used by:** The `read_subtree` tool to show parsed variable names alongside the file tree
- **Depends on:** nothing (leaf package)

### `packages/build-tools/` — Build Utilities

Custom build executors, currently just the Infisical secrets integration.

### `.agents/` — Local Agent Templates

Project-specific agent definitions for this repository. These are loaded automatically by the agent runtime.

- CLI agent templates (claude-code-cli, codex-cli, gemini-cli, codebuff-local-cli)
- Notion query agents
- Skills (cleanup, meta, review)

### `evals/` — Evaluation Framework

BuffBench evaluation suite for measuring agent performance on real-world coding tasks.

- **Workflow:** Pick commits → generate eval tasks → run agents → judge results → extract lessons
- **Runners:** Codebuff, Claude Code, Codex
- **Depends on:** `common`, `agent-runtime`, `sdk`

### `freebuff/` — Free Tier Product

A separate free-to-use version of Codebuff with its own CLI binary and web app.

- `freebuff/cli/` — Standalone CLI binary and release scripts
- `freebuff/web/` — Minimal Next.js app for auth (login, onboarding)
- Uses ChatGPT OAuth for free LLM access (no Codebuff credits required)

### `scripts/` — Development & Operations

Developer tooling, analytics scripts, and service management.

- `start-services.ts` / `stop-services.ts` / `status-services.ts` — Local dev environment management
- `tmux/` — tmux helper scripts for CLI E2E testing
- Analytics: DAU calculation, MRR, subscriber profitability, model usage
- Release: changelog generation, credit grants, worktree management

## Key Architectural Patterns

### Dependency Injection via Contracts

The codebase avoids tight coupling between packages using contract types in `common/src/types/contracts/`:

- `database.ts` — DB access functions (`GetUserInfoFromApiKeyFn`, `StartAgentRunFn`, etc.)
- `llm.ts` — LLM calling functions (`PromptAiSdkStreamFn`, `PromptAiSdkFn`)
- `analytics.ts` — Event tracking (`TrackEventFn`)
- `client.ts` — Client-server communication (`RequestToolCallFn`, `SendActionFn`)
- `env.ts` — Environment variable access (`BaseEnv`, `ClientEnv`, `CiEnv`)

This allows the agent-runtime to be used by both the SDK (local execution) and the web server (if needed) without direct dependencies.

### ErrorOr Pattern

Prefer `ErrorOr<T>` return values (`success(value)` / `failure(error)`) over throwing exceptions. Defined in `common/src/util/error.ts`.

### Local Tool Execution

Tool calls (file edits, terminal commands, code search) execute **on the user's machine** via the SDK, not on the server. The agent-runtime sends tool call requests through `requestToolCall`, which the SDK handles locally.

### AI SDK Integration

The project uses Vercel's [AI SDK](https://sdk.vercel.ai/) (`ai` package) for LLM interactions:

- `streamText()` for streaming responses
- `generateText()` / `generateObject()` for non-streaming
- Custom `OpenAICompatibleChatLanguageModel` provider for the Codebuff backend
- `APICallError` for HTTP error handling (see [Error Schema](./error-schema.md))

### Agent Template System

Agents are defined as templates with:

- **Prompt agents** — System prompt + tool list + spawnable subagents
- **Programmatic agents** — `handleSteps` generator functions that run in a sandbox
- Templates live in `agents/` (shipped) and `.agents/` (project-local)
- Users can publish agents to the Codebuff registry

## Development

```bash
bun up          # Start web server + database
bun start-cli   # Start CLI (separate terminal)
bun ps          # Check running services
bun down        # Stop services
bun typecheck   # Run all type checks
bun test        # Run all tests
```

See the [Request Flow](./request-flow.md) doc for the detailed path a prompt takes through the system.
