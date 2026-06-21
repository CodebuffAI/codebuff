# Architecture Overview

Openbuff is an independent, local-first, and Bring Your Own Key (BYOK) fork of Codebuff. It is a TypeScript monorepo (Bun workspaces) that provides an AI-powered coding assistant via a CLI and SDK. Openbuff is designed to run entirely on the user's local machine, routing all LLM inference to user-configured OpenAI-compatible or Anthropic-compatible providers with no hosted backend, subscription, or credit requirements.

## Monorepo Package Structure

While Openbuff runs entirely client-side/locally, it maintains structural monorepo compatibility with upstream Codebuff. Some backend, database, and billing packages remain in the repository for legacy code compatibility and ease of merging updates, but they are completely unused or disabled during local BYOK execution.

```
                                  ┌──────────┐
                                  │   cli/   │  TUI client (OpenTUI + React)
                                  └────┬─────┘
                                       │
                                  ┌────▼─────┐
                          ┌───────│   sdk/   │  JS/TS SDK (Local / BYOK routing)
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
               (unused) (unused)            (legacy web)
```

## Packages

### `cli/` — TUI Client

The user-facing terminal UI, run via the `openbuff` CLI command (with fallback support for `codebuff --local`). Built with [OpenTUI](https://github.com/nickhudkins/opentui) (a React renderer for terminals) and React hooks.

- **Entry point:** `src/index.tsx` → `src/app.tsx` → `src/chat.tsx`
- **Key responsibilities:**
  - Renders the chat interface, agent output, tool call results, and status indicators.
  - Manages user input, slash commands (`/help`, `/provider`, `/models`), and agent mode selection (DEFAULT, PLAN).
  - Handles local session persistence and chat history.
  - Calls `client.run()` from the SDK and processes streaming events.
- **Depends on:** `sdk`, `common`

### `sdk/` — JavaScript/TypeScript SDK

The public SDK used by the CLI and available to external users via `@codebuff/sdk` on npm.

- **Entry point:** `src/client.ts` (`CodebuffClient` / compatible alias) → `src/run.ts` (`run()`)
- **Key responsibilities:**
  - Orchestrates agent runs: initializes local session state, registers tool handlers, calls `callMainPrompt()`.
  - **Executes tool calls locally** on the user's machine (file edits, terminal commands, code search).
  - Manages model provider routing dynamically: reads `openbuff.json` (or the legacy compatibility alias `codebuff.json`) to select and invoke user-configured OpenAI-compatible APIs (OpenAI, OpenRouter, Ollama, GLM, etc.), Anthropic-compatible Claude APIs, or ChatGPT OAuth directly from the client.
- **Depends on:** `agent-runtime`, `common`, `internal` (for OpenAI-compatible provider)

### `packages/agent-runtime/` — Agent Execution Engine

The core agent loop that drives LLM inference, tool execution, and multi-step reasoning.

- **Entry point:** `src/main-prompt.ts` → `src/run-agent-step.ts` (`loopAgentSteps()`)
- **Key responsibilities:**
  - Runs the agent loop: local LLM call → process response → execute tool calls locally → repeat.
  - Manages agent templates, system prompts, and tool definitions.
  - Handles subagent spawning and programmatic agent steps (`handleSteps` generators).
  - Processes the AI SDK stream (`streamText()`) and routes tool calls to the SDK.
  - Manages local context token counting, cache debugging, and local cost estimates.
- **Depends on:** `common`, `agents` (for agent templates)

### `common/` — Shared Library

Shared types, utilities, constants, and tool definitions used across the entire monorepo.

- **Key areas:**
  - `src/types/` — TypeScript types: `SessionState`, `AgentOutput`, `Message`, contracts for DI.
  - `src/tools/` — Tool parameter schemas (Zod), tool names, and tool call validation.
  - `src/constants/` — Model configurations, agent IDs, and provider routing settings.
  - `src/util/` — Error handling (`ErrorOr<T>`), message utilities, string helpers, XML parsing.
  - `src/templates/` — Agent definition types and initial `.agents/` directory templates.
- **Depends on:** nothing (leaf package)

### `agents/` — Agent Definitions

Prompt-based and programmatic agent definitions that ship with Openbuff.

- **Key agents:**
  - `base2/` — The default agent family (base2, base2-plan).
  - `editor/` — Code editing specialist.
  - `file-explorer/` — File picker, code searcher, directory lister, glob matcher.
  - `thinker/` — Deep reasoning agent.
  - `reviewer/` — Code review agent.
  - `researcher/` — Local web search and docs search agents.
  - `basher.ts` — Terminal command execution agent (id: 'basher', displayName: 'Basher').
  - `context-pruner.ts` — Conversation summarization to manage context length.
- **Depends on:** `common` (for agent definition types and tool params)

### `web/` — Upstream Web Application (Legacy/Unused in Openbuff)

The original Codebuff web server, marketing site, and API.

- **Note:** In the Openbuff BYOK fork, this package is **not hosted, run, or required**. Openbuff does not proxy requests to any hosted backend or database. Users communicate directly with their chosen providers from their local machines. This directory is preserved strictly for upstream structural alignment and compatibility.

### `packages/internal/` — Internal Utilities

Server-side utilities, database schema, and provider wrappers shared between `web` and `sdk`. Under Openbuff, the SDK uses the local `openai-compatible` client wrappers directly to contact user-configured endpoints.

### `packages/billing/` and `packages/bigquery/` (Unused in Openbuff)

- **`packages/billing/`**: Upstream billing and credit tracking. Openbuff does not charge credits or require a subscription, making this package completely unused.
- **`packages/bigquery/`**: Upstream telemetry/analytics. In Openbuff, no analytics or telemetry data is uploaded to any central server.

### `packages/code-map/` — Code Parsing

Tree-sitter based source code parser that extracts function/variable names for file tree display. Used locally by the `read_subtree` tool.

- **Supports:** TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP
- **Depends on:** nothing (leaf package)

### `.agents/` — Local Agent Templates

Project-specific agent definitions for this repository. These are loaded automatically by the agent runtime.

- CLI agent templates (claude-code-cli, codex-cli, gemini-cli, openbuff-local-cli)
- Notion query agents
- Skills (cleanup, meta, review)

### `evals/` — Evaluation Framework

BuffBench evaluation suite for measuring agent performance on real-world coding tasks.

- **Workflow:** Pick commits → generate eval tasks → run agents → judge results → extract lessons
- **Runners:** Openbuff, Claude Code, Codex
- **Depends on:** `common`, `agent-runtime`, `sdk`

---

## Key Architectural Principles

### Bring Your Own Key (BYOK) & No Backend Fallback

Openbuff operates on a strict BYOK architecture. There is absolutely no backend server fallback, hosted inference, or credit billing. Every single request is resolved directly to a configured LLM provider (specified in `openbuff.json` or its legacy compatibility counterpart `codebuff.json`):

- All LLM interactions are initiated directly from the user's terminal to the provider's API.
- Local API keys (e.g. `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or custom keys) are loaded from environment variables or provider configuration.

### Local Tool Execution

All tool execution (such as reading/writing files, searching files, and running terminal commands) occurs locally on the developer's computer. The SDK accepts these tool call requests from the agent runtime, verifies permissions, and executes them natively.

### ErrorOr Pattern

To maintain robust and deterministic execution without unexpected crashes, the codebase avoids traditional exceptions in favor of the `ErrorOr<T>` pattern (`success(value)` or `failure(error)`), defined in `common/src/util/error.ts`.

### Deterministic Edits, Reviewer Gates, and Plan Artifacts

Three cross-cutting subsystems shape how the agent runtime, SDK, and CLI
interact beyond raw model calls. Each is documented in detail in its own
page; the high-level wiring is:

- **Staged read-before-edit.** Edit tools (`str_replace`,
  `edit_transaction`, patch applicators) can require a recent
  `read_files` authorization (or an explicit `basedOnRead` capability)
  before mutating a path under strict-mode flows. Successful edits
  invalidate that authorization. See
  [Deterministic Edit System](./deterministic-edit-system.md).
- **Reviewer / validation gate.** A turn that opts into the gate tracks
  pending gate files with working-tree content markers
  (`sha256:<hash>:<byteLength>`), runs validation hooks plus a reviewer
  gate, fails closed on missing/unreadable files, and exposes a
  structured `<gate-state>` block as the stable user-visible contract.
  See [Request Flow](./request-flow.md#reviewer--validation-gate-semantics).
- **PlanLink and durable plan artifacts.** Plan artifacts under
  `.agents/sessions/<plan>/` are attached to TUI sessions via PlanLink
  slash commands (`/resume-plan`, `/update-plan`, `/plan-status`,
  `/lessons`). `update_plan_status` is the preferred tool for
  incremental `STATUS.md` and append-only lesson edits; `create_plan`
  remains for whole-artifact creation or rewrite. See
  [Local Mode](./local-mode.md) and
  [Agents and Tools](./agents-and-tools.md).

### Compatibility Aliases & Legacy Support

During the transition from the upstream Codebuff codebase, several namespaces and interfaces remain as legacy compatibility aliases so existing tools and projects do not break:

- **CLI Commands:** The CLI binary is named `openbuff`, but continues to support commands like `codebuff --local` or legacy configuration hooks.
- **Environment Variables:** `OPENBUFF_*` is preferred, but `CODEBUFF_*` prefixes are fully supported.
- **Configuration Files:** `openbuff.json` is the standard configuration file; however, any existing `codebuff.json` is automatically parsed and processed with identical behavior.
- **SDK Package:** The npm SDK is distributed under `@codebuff/sdk` to prevent breaking changes for existing SDK consumers.
