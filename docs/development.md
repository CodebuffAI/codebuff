# Development Guide

This guide covers local environment setup, monorepo architecture, development workflows, and testing practices for contributing to Freebuff.

---

## 📦 Monorepo Architecture

Freebuff is structured as a TypeScript monorepo using Bun workspaces:

| Workspace | Path | Purpose |
|---|---|---|
| **CLI** | `cli/` | Terminal User Interface (TUI) built with React and OpenTUI |
| **SDK** | `sdk/` | `@codebuff/sdk` public package to orchestrate agents programmatically |
| **Common** | `common/` | Shared types, Zod schemas, utilities, and tool definitions |
| **Agents** | `agents/` | Agent definitions, prompts, and templates |
| **Agent Runtime** | `packages/agent-runtime/` | Multi-agent execution loop, step orchestration, and tool execution |
| **Code Map** | `packages/code-map/` | AST and Tree-sitter powered codebase indexing |
| **LLM Providers** | `packages/llm-providers/` | Model adapters (DeepSeek, OpenAI, Anthropic, Gemini, MiMo, MiniMax) |
| **Freebuff** | `freebuff/` | Freebuff distribution packaging and CLI build scripts |
| **Tmux Scripts** | `scripts/tmux/` | Terminal emulation helpers for interactive CLI testing |

---

## 🛠️ Prerequisites

- **[Bun](https://bun.sh)**: `v1.3.14` or higher (primary package manager and runtime)
- **Node.js**: `v22+` (for compatibility with certain tooling)
- **Git**: For version control
- **tmux** *(optional)*: Required only for interactive CLI E2E testing (macOS: `brew install tmux`, Linux: `sudo apt-get install tmux`)

---

## 🚀 Getting Started

### 1. Install Dependencies

Install all workspace dependencies from the root:

```bash
bun install
```

### 2. Build the SDK

The CLI and other packages depend on the built SDK:

```bash
bun run build:sdk
```

### 3. Run the CLI in Development Mode

Start the terminal UI directly from source:

```bash
# Standard CLI dev mode
bun start-cli

# Or run Freebuff mode
bun run dev:freebuff
```

### 4. Build the Freebuff Binary

Compile the standalone Freebuff distribution binary:

```bash
bun run build:freebuff
```

---

## 🧪 Testing

Freebuff uses `bun:test` for fast, isolated unit and integration testing.

### Running Unit Tests

Run all unit tests across the repository:

```bash
bun test
```

Or run tests for a specific workspace:

```bash
# Test common utilities
bun test common/src/

# Test SDK
bun test sdk/

# Test CLI
bun test cli/
```

### Interactive CLI Testing (tmux)

For testing terminal rendering, bracketed paste mode, and keyboard navigation, Freebuff uses tmux-based session testing. See [`docs/testing.md`](./testing.md) and [`scripts/tmux/README.md`](../scripts/tmux/README.md) for full details.

---

## 📋 Code Conventions & Pre-PR Checklist

Before opening a pull request, ensure the following checks pass:

1. **Build the SDK**: `bun run build:sdk`
2. **Run Unit Tests**: `bun test`
3. **Validate Monorepo CI**: `bun run ci`
4. **Clean Code**: Follow TypeScript strict typing, avoid `any`, and preserve existing documentation.

For pull request submission guidelines and scoping rules, see the [Contributing Guide](../CONTRIBUTING.md).
