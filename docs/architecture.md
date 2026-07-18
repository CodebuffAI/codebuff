# Architecture Overview

Openbuff is an independent, local-first, and Bring Your Own Key (BYOK) fork of Codebuff. It is a TypeScript monorepo (Bun workspaces) that provides an AI-powered coding assistant via a CLI and SDK. Openbuff is designed to run entirely on the user's local machine, routing all LLM inference to user-configured OpenAI-compatible or Anthropic-compatible providers with no hosted backend, subscription, or credit requirements.

## Monorepo Package Structure

Openbuff keeps the monorepo focused on local CLI/SDK execution. Hosted web, billing, BigQuery, and free-mode product surfaces have been removed from the active workspace.

```
                          ┌──────────┐
                          │   cli/   │  TUI client (OpenTUI + React)
                          └────┬─────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
        ┌─────▼─────┐    ┌─────▼─────┐    ┌─────▼─────┐
        │   sdk/    │    │  common/  │    │ indexer/  │
        │ @openbuff │    │  (leaf)   │    │           │
        │   /sdk    │    └───────────┘    └─────┬─────┘
        └───────────┘                           │
        (standalone;                      ┌─────▼─────┐
         no workspace deps)               │ code-map/ │
                                          └───────────┘

  Other private workspace packages (@codebuff/*):
    agent-runtime/ → code-map/      internal/ → common/
    evals/ → {code-map, common, internal, sdk}   agents/ (leaf)
    build-tools/   scripts/   .agents/
```

## Packages

### `cli/` — TUI Client

The user-facing terminal UI, run via the `openbuff` CLI command (the `codebuff` command prefix is a legacy alias retained during the transition where the shim is installed; prefer `openbuff`). Built with [OpenTUI](https://github.com/nickhudkins/opentui) (a React renderer for terminals) and React hooks.

- **Entry point:** `cli/src/index.tsx` → `cli/src/app.tsx` → `cli/src/chat.tsx`
- **Key responsibilities:**
  - Renders the chat interface, agent output, tool call results, and status indicators.
  - Manages user input, slash commands (`/help`, `/provider`, `/models`), and agent mode selection (DEFAULT, PLAN).
  - Handles local session persistence and chat history.
  - Calls `client.run()` from the SDK and processes streaming events.
- **Depends on:** `sdk` (published as `@openbuff/sdk`), `common` (`@codebuff/common`), `indexer` (`@codebuff/indexer`)

### `sdk/` — JavaScript/TypeScript SDK

The public SDK used by the CLI and available to external users via `@openbuff/sdk` on npm.

- **Entry point:** `sdk/src/client.ts` (`OpenbuffClient`, with `CodebuffClient` as a compatibility alias) → `sdk/src/run.ts` (`run()`)
- **Key responsibilities:**
  - Orchestrates agent runs: initializes local session state, registers tool handlers, calls `callMainPrompt()`.
  - **Executes tool calls locally** on the user's machine (file edits, terminal commands, code search).
  - Creates a worktree-scoped cooperative mutation broker for the default Node filesystem. Participating Openbuff processes serialize exact-byte conditional commits, deletes, creates, and no-clobber moves through a durable receipt journal; external editors remain outside this authority and are detected through workspace revision/watcher invalidation.
  - Manages model provider routing dynamically: reads `openbuff.json` to select and invoke user-configured OpenAI-compatible APIs (OpenAI, OpenRouter, Ollama, GLM, etc.), Anthropic-compatible Claude APIs, or ChatGPT OAuth directly from the client.
- **Depends on:** none (standalone — published as `@openbuff/sdk` with no workspace dependencies)

### `packages/agent-runtime/` — Agent Execution Engine

The core agent loop that drives LLM inference, tool execution, and multi-step reasoning.

- **Entry point:** `packages/agent-runtime/src/main-prompt.ts` → `packages/agent-runtime/src/run-agent-step.ts` (`loopAgentSteps()`)
- **Key responsibilities:**
  - Runs the agent loop: local LLM call → process response → execute tool calls locally → repeat.
  - Manages agent templates, system prompts, and tool definitions.
  - Handles subagent spawning and programmatic agent steps (`handleSteps` generators).
  - Processes the AI SDK stream (`streamText()`) and routes tool calls to the SDK.
  - Manages local context token counting, cache debugging, and local cost estimates.
- **Depends on:** `code-map` (`@codebuff/code-map`)

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
- **Depends on:** nothing (leaf package)

### `packages/internal/` — Internal Utilities

Provider wrappers and support utilities used by the SDK to contact user-configured endpoints directly. This package is retained only where it supports local/BYOK provider routing.

### `packages/code-map/` — Code Parsing

Tree-sitter based source code parser that extracts function/variable names for file tree display. Used locally by the `read_subtree` tool.

- **Supports:** TypeScript, JavaScript, Python, Go, Rust, Java, C, C++, C#, Ruby, PHP, Swift, Kotlin, GDScript

The tree-sitter WASM grammars normally ship from `tree-sitter-wasms` or
`@vscode/tree-sitter-wasm`. Grammars those packages do not publish, including
GDScript, use an immutable source URL and pinned SHA-256 in
`packages/code-map/src/grammar-wasm-repair.ts`. Release builds and legacy
installed binaries accept downloaded executable WASM only after checksum
verification. If a grammar still cannot be loaded at runtime,
`getLanguageConfig` returns `undefined` (graceful no-op) — files of that
extension are skipped for symbol extraction but still indexed by path and
extension.

- **Depends on:** nothing (leaf package)

### `packages/indexer/` — Codebase Graph Indexer

Builds and queries the local codebase graph index backing the `query_index` tool for retrieval-led context gathering.

The import graph uses language-aware extraction and conservative resolution for
the supported ecosystems rather than treating every repository as
JavaScript/TypeScript. Ambiguous module suffixes remain unresolved instead of
creating a guessed reference edge.

- **Key responsibilities:** indexes file paths, extensions, symbols, imports, markdown headings, documentation concepts, package scripts, and CI workflow commands into a graph supporting ranked search, neighbor, and shortest-path queries.
- **Depends on:** `code-map` (`@codebuff/code-map`), `ignore`

### `packages/build-tools/` — Build Tooling

Internal build tooling and helpers that support the monorepo's build pipeline. Private; not published.

- **Depends on:** (workspace-internal tooling)

### `.agents/` — Local Agent Templates

Project-specific agent definitions for this repository. These are loaded automatically by the agent runtime.

- CLI agent templates (claude-code-cli, codex-cli, gemini-cli, openbuff-local-cli)
- Notion query agents
- Skills (cleanup, meta, review)

### `evals/` — Evaluation Framework

BuffBench evaluation suite for measuring agent performance on real-world coding tasks.

- **Workflow:** Pick commits → generate eval tasks → run agents → judge results → extract lessons
- **Runners:** Openbuff, Claude Code, Codex
- **Depends on:** `code-map`, `common`, `internal`, `sdk` (all as `@codebuff/*` except `sdk`, which is published as `@openbuff/sdk`)

---

## Key Architectural Principles

### Bring Your Own Key (BYOK) & No Backend Fallback

Openbuff operates on a strict BYOK architecture. There is absolutely no backend server fallback, hosted inference, or credit billing. Every single request is resolved directly to a configured LLM provider (specified in `openbuff.json`):

- All LLM interactions are initiated directly from the user's terminal to the provider's API.
- Local API keys (e.g. `OPENAI_API_KEY`, `OPENROUTER_API_KEY`, or custom keys) are loaded from environment variables or provider configuration.

### Local Tool Execution

All tool execution (such as reading/writing files, searching files, and running terminal commands) occurs locally on the developer's computer. The SDK accepts these tool call requests from the agent runtime, verifies permissions, and executes them natively.

Binary 3D assets are represented in project discovery and the metadata index by
path, format, size, hash, and derived concepts rather than UTF-8 content. The
SDK owns structured inspection, deterministic Blender preview rendering, and
hash-guarded declarative `.blend` mutation. Generated evidence is project
scoped under `.openbuff/artifacts/3d/`; preview receipts bind artifact hashes
and dimensions to the exact source hash used for rendering.

### ErrorOr Pattern

To maintain robust and deterministic execution without unexpected crashes, the codebase avoids traditional exceptions in favor of the `ErrorOr<T>` pattern (`success(value)` or `failure(error)`), defined in `common/src/util/error.ts`.

### Deterministic Edits, Reviewer Gates, and Plan Artifacts

Three cross-cutting subsystems shape how the agent runtime, SDK, and CLI
interact beyond raw model calls. Each is documented in detail in its own
page; the high-level wiring is:

- **Staged read-before-edit.** Edit tools (`str_replace`,
  `edit_transaction`, patch applicators) can require a recent
  `read_files` authorization (or an authenticated `cap.v3`
  `basedOnRead` capability bound to the current project, path, and run)
  before mutating a path under strict-mode flows. Legacy range hashes remain
  freshness checks but cannot authorize an otherwise unread path. Successful
  edits invalidate stale anchors. See
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

During the transition from the upstream Codebuff codebase, a small set of compatibility aliases are retained so existing tools and projects do not break. Most legacy surfaces were deliberately removed in the "BYOK purge"; only the aliases below remain:

- **CLI Commands:** The CLI binary is named `openbuff`. The `codebuff` command prefix is a legacy alias retained during the transition where the shim is installed; prefer `openbuff`. The `codebuff --local` form is not documented as a supported invocation in current code.
- **Environment Variables:** `OPENBUFF_*` variables are primary. Retained compatibility env names are intentionally narrow and documented in [Environment Variables](./environment-variables.md): for example, `CODEBUFF_API_KEY` is accepted as a fallback for `OPENBUFF_API_KEY`, while removed routing/config aliases such as `CODEBUFF_LOCAL_MODE` and `CODEBUFF_PROVIDER_CONFIG` are not read.
- **Configuration Files:** Openbuff reads `openbuff.json` only. `codebuff.json` is not parsed.
- **SDK Package:** The SDK is published as `@openbuff/sdk`. `CodebuffClient` remains a compatibility alias for `OpenbuffClient`.

### Internal Workspace Package Names

All internal workspace packages retain their historical `@codebuff/*` names: `@codebuff/common`, `@codebuff/agents`, `@codebuff/internal`, `@codebuff/code-map`, `@codebuff/indexer`, `@codebuff/agent-runtime`, `@codebuff/build-tools`, `@codebuff/evals`, `@codebuff/scripts`, `@codebuff/.agents`, and the workspace `@codebuff/cli` (which is published as `@openbuff/cli`). These are private and never published to npm. Only `@openbuff/cli` (v0.1.0) and `@openbuff/sdk` (v0.11.0) are published. Homepage: openbuff.dev. Repo: github.com/AnzoBenjamin/openbuff.
