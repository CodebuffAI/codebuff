# Contributing to Openbuff

Hey there! 👋 Thanks for contributing to Openbuff. Bug fixes, features, and documentation improvements are welcome.

> **Openbuff is local-first and BYOK (Bring Your Own Key).** If you only want to use or develop the CLI with your own API keys, you do **not** need Docker, a database, GitHub OAuth credentials, or credits — just configure `openbuff.json` with your providers and run `bun start-cli`.

## Getting Started

### Prerequisites

Before you begin, you'll need to install a few tools:

1. **Bun** (our primary package manager): Follow the [Bun installation guide](https://bun.sh/docs/installation)
2. **Docker**: Optional; only needed for specific local integration services. Most CLI/SDK contributors do not need it.

### Setting Up Your Development Environment

1. **Clone the repository**:

   ```bash
   git clone https://github.com/AnzoBenjamin/openbuff.git
   cd openbuff
   ```

2. **Configure local providers**:

   Create or update `openbuff.json` in your project root with your provider API keys, or export provider-owned environment variables such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or `OPENROUTER_API_KEY`.

> **Team members**: For shared secrets management, see the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md).

3. **Install dependencies**:

   ```bash
   bun install
   ```

4. **Start the CLI**:

   ```bash
   bun run start-cli
   # Expected: Welcome to Openbuff! + agent list
   ```

   The CLI runs in local/BYOK mode and uses your configured provider credentials. No Openbuff-hosted login, credits, subscription, or dashboard is required.

## Understanding the Codebase

Openbuff is organized as a monorepo with these main packages. Some package names still use `@codebuff/*` as compatibility/internal workspace names; do not rename them casually.

- **cli/**: CLI application that users interact with
- **common/**: Shared utilities, contracts, schemas, and types used across retained packages
- **sdk/**: TypeScript SDK for programmatic usage
- **agents/**: Agent definition files and templates
- **packages/**: Internal runtime and support packages retained for CLI/SDK functionality
- **evals/**: Evaluation framework and benchmarks

## Making Contributions

### Finding Something to Work On

Not sure where to start? Here are some great ways to jump in:

- **New here?** Look for issues labeled `good first issue` - they're perfect for getting familiar with the codebase
- **Ready for more?** Check out `help wanted` issues where we could really use your expertise
- **Have an idea?** Browse open issues or create a new one to discuss it
- **Want to chat?** Open a [GitHub Issue](https://github.com/AnzoBenjamin/openbuff/issues) - the team loves discussing new ideas!

### Development Workflow

1. **Fork and branch** - Create a fork and a new branch
2. **Follow style guidelines** - See below
3. **Test** - Write tests for new features, run `bun test`
4. **Type check** - Run `bun run typecheck`
5. **Submit a PR** - Clear description of changes

Small PRs merge faster.

### Code Style Guidelines

We keep things consistent and readable:

- **TypeScript everywhere** - It helps catch bugs and makes the code self-documenting
- **Specific imports** - Use `import { thing }` instead of `import *` (keeps bundles smaller!)
- **Follow the patterns** - Look at existing code to match the style
- **Reuse utilities** - Check if there's already a helper for what you need
- **Test with `spyOn()`** - Our preferred way to mock functions in tests
- **Clear function names** - Code should read like a story

### Testing

Testing is important! Here's how to run them:

```bash
bun test                    # Run all tests
bun test --watch           # Watch mode for active development
bun test specific.test.ts  # Run just one test file
```

**Writing tests:** Use `spyOn()` for mocking functions (it's cleaner than `mock.module()`), and always clean up with `mock.restore()` in your `afterEach()` blocks.

#### Interactive CLI Testing

For testing interactive CLI features (user input, real-time responses), install tmux:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows (via WSL)
wsl --install
sudo apt-get install tmux
```

Run the proof-of-concept to validate your setup:

```bash
cd cli
bun run test:tmux-poc
```

See [cli/src/**tests**/README.md](cli/src/__tests__/README.md) for comprehensive interactive testing documentation.

### Commit Messages

We use conventional commit format:

```
feat: add new agent for React component generation
fix: resolve WebSocket connection timeout
docs: update API documentation
test: add unit tests for file operations
```

## Areas Where We Need Help

### 🤖 **Agent Development**

Build agents in `agents/` for different languages, frameworks, or workflows.

### 🔧 **Tool System**

Add capabilities in `common/src/tools` and SDK helpers: file operations, API integrations, dev environment helpers.

### 📦 **SDK Improvements**

New methods, better TypeScript support, integration examples in `sdk/`.

### 💻 **CLI**

Improve `cli/`: better commands, error messages, interactive features.

## Getting Help

**Setup issues?**

- **Script errors?** Double-check you're using bun for all commands
- **Using Infisical?** See the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md) for team secrets management

**Questions?** Open a [GitHub Issue](https://github.com/AnzoBenjamin/openbuff/issues) - we're friendly and always happy to help!

## Resources

- **Documentation**: See the [docs/](./docs) directory and [AGENTS.md](./AGENTS.md)
- **Community & Support**: [GitHub Issues](https://github.com/AnzoBenjamin/openbuff/issues)
- **Report issues**: [GitHub Issues](https://github.com/AnzoBenjamin/openbuff/issues)
