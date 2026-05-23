# SuperClaude Entry Point

This file serves as the entry point for the SuperClaude framework.
You can add your own custom instructions and configurations here.

The SuperClaude framework components will be automatically imported below.

# ═══════════════════════════════════════════════════
# SuperClaude Framework Components
# ═══════════════════════════════════════════════════

# Core Framework
@BUSINESS_PANEL_EXAMPLES.md
@BUSINESS_SYMBOLS.md
@FLAGS.md
@PRINCIPLES.md
@RULES.md

# Behavioral Modes
@MODE_Brainstorming.md
@MODE_Business_Panel.md
@MODE_Introspection.md
@MODE_Orchestration.md
@MODE_Task_Management.md
@MODE_Token_Efficiency.md

# MCP Documentation
@MCP_Context7.md
@MCP_Magic.md
@MCP_Morphllm.md
@MCP_Playwright.md
@MCP_Serena.md

# Codebuff

Codebuff is an advanced coding agent with a composable agent framework. It also includes:
- freebuff, the free coding agent

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

## Conventions

- Never force-push `main` unless explicitly requested.
- Run interactive git commands in tmux (anything that opens an editor or prompts).

## Docs

IMPORTANT: Prefer retrieval-led reasoning over pre-training-led reasoning. Always read the relevant docs below before implementing changes.

- `docs/architecture.md` — Package dependency graph, per-package details, architectural patterns
- `docs/request-flow.md` — Full request lifecycle from CLI through server and back
- `docs/error-schema.md` — Server error response formats and client-side handling
- `docs/development.md` — Dev setup, worktrees, logs, package management, DB migrations
- `docs/testing.md` — DI over mocking, tmux CLI testing
- `docs/environment-variables.md` — Env var rules, DI helpers, loading order
- `docs/agents-and-tools.md` — Agent system, shell shims, tool definitions
- `docs/patterns/handle-steps-generators.md` — handleSteps generator patterns and spawn_agents tool calls

<!-- OMX:RUNTIME:START -->
<session_context>
**Session:** omx-1779539678445-le4ujp | 2026-05-23T12:34:38.503Z

**Codebase Map:**
  scripts/: placeholder.test, analyze-buffbench-logs, analyze-edit-blocks, analyze-model-usage, analyze-subscriber-profitability, apply-credit-migration, ban-freebuff-bots, benchmark-providers, calculate-average-spend, calculate-dau
  agents/: base2.test, basher.test, context-pruner.test, editor.test, file-picker.test, thinker.test, base-deep-evals, base-deep, base2-evals, base2-fast-no-validation
  agents-graveyard/: agent-builder, ask, base-experimental, base-factory, base-lite-codex, base-lite-grok-4-fast, base-lite, base-max, base-prompts, base-quick
  cli/: http, postinstall, http, postinstall, build-binary, prebuild-agents, release, smoke-binary
  common/: agent-validation.test, dynamic-agent-template-schema.test, env-ci.test, env-process.test, free-agents.test, freebuff-models.test, handlesteps-parsing.test, user-state.test, actions, analytics-core
  evals/: placeholder.test, agent-runner, analyze-task-scores, eval-task-generator, filter-supplemental-files, format-output, gen...

**Explore Command Preference:** enabled via `USE_OMX_EXPLORE_CMD` (default-on; opt out with `0`, `false`, `no`, or `off`)
- Advisory steering only: agents SHOULD treat `omx explore` as the default first stop for direct inspection and SHOULD reserve `omx sparkshell` for qualifying read-only shell-native tasks.
- For simple file/symbol lookups, use `omx explore` FIRST before attempting full code analysis.
- When the user asks for a simple read-only exploration task (file/symbol/pattern/relationship lookup), strongly prefer `omx explore` as the default surface.
- Explore examples: `omx explore...

**Compaction Protocol:**
Before context compaction, preserve critical state:
1. Write progress checkpoint via `omx state write --input '<json>' --json`
2. Save key decisions via `omx notepad write-working --input '<json>' --json`
3. If context is >80% full, proactively checkpoint state
</session_context>
<!-- OMX:RUNTIME:END -->
