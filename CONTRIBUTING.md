# Contributing to Openbuff

Hey there! 👋 Thanks for contributing to Openbuff. Bug fixes, features, and documentation improvements are welcome.

> **Openbuff is a local-first, BYOK (Bring Your Own Key) fork of Codebuff.** If you only want to use or develop the CLI with your own API keys, you do **not** need Docker, a database, GitHub OAuth credentials, or credits — just configure `openbuff.json` with your providers and run `bun start-cli`. The cloud infrastructure (web server, database, credit system) is only needed when developing the hosted web application.

## Getting Started

### Prerequisites

Before you begin, you'll need to install a few tools:

1. **Bun** (our primary package manager): Follow the [Bun installation guide](https://bun.sh/docs/installation)
2. **Docker**: Required for the hosted web server database (not needed for local BYOK CLI development)

### Setting Up Your Development Environment

1. **Clone the repository**:

   ```bash
   git clone https://github.com/AnzoBenjamin/openbuff.git
   cd openbuff
   ```

2. **Set up environment variables**:

   ```bash
   # Copy the example file
   cp .env.example .env.local

   # Edit .env.local and update DATABASE_URL to match Docker:
   # DATABASE_URL=postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local
   ```

### Required local env changes

The `.env.example` provides defaults. When you create ` .env.local` make sure to update the following important fields for local development:

> **BYOK / local CLI only?** You do not need any of the cloud variables below. Instead, configure `openbuff.json` in your project root with your provider API keys and run `bun start-cli` directly.

- **OPEN_ROUTER_API_KEY**: set to your OpenRouter key (used for LLM calls by the hosted web app). Example:
  - `OPEN_ROUTER_API_KEY=sk-or-v1-...`
- **GRAVITY_API_KEY**: optional; use `test` for ad/analytics testing in dev.
- **PORT**: the example defaults to `4242`. This repo commonly runs on `3000` during development — set `PORT=3000` if you want the web app on `http://localhost:3000`.
- **NEXTAUTH_URL**: when using port 3000 set `NEXTAUTH_URL=http://localhost:3000` to ensure OAuth callbacks work.
- **CODEBUFF_GITHUB_ID** / **CODEBUFF_GITHUB_SECRET**: GitHub OAuth app credentials — only required when developing the hosted web app sign-in flow. Not needed for local BYOK CLI development.
- **DATABASE_URL**: confirm this points to your local Docker Postgres (default is fine for the built-in Docker setup). Only needed for hosted web app development:
  - `DATABASE_URL=postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local`
- **CODEBUFF_API_KEY**: optional CLI fallback for the legacy hosted Codebuff API — not required for Openbuff BYOK mode.

Notes / gotchas:

- After editing `.env.local` you must restart the dev server (`bun run start-web`) — environment variables are loaded at startup.
- If you use OpenRouter, ensure the account associated with your API key has credits (OpenRouter will return 402 Payment Required otherwise).
- If you see Postgres role errors during migrations, re-create the DB and wait for it to fully initialize:
  ```bash
  cd packages/internal/src/db && docker compose down -v && docker compose up --wait
  ```

> **Team members**: For shared secrets management, see the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md).

3. **Install dependencies**:

   ```bash
   bun install
   ```

4. **Setup a Github OAuth app**
   1. Follow these instructions to set up a [Github OAuth app](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/creating-an-oauth-app)
   2. Add your Github client ID and secret to `.env.local`:

   ```bash
   CODEBUFF_GITHUB_ID=<your-github-app-id-here>
   CODEBUFF_GITHUB_SECRET=<your-github-app-secret-here>
   ```

5. **Start development services**:

   ```bash
   # Terminal 1 - Start the web server first
   bun run start-web
   # Expected: Ready on http://localhost:3000

   # Terminal 2 - Start the CLI (requires web server to be running)
   bun run start-cli
   # Expected: Welcome to Openbuff! + agent list
   ```

   Now, you should be able to run the CLI and send commands, but it will error out because you don't have any credits.

6. **Giving yourself credits** (only needed for hosted/cloud development; Openbuff local/BYOK provider mode does not require credits):
   1. Log into the local web dashboard at [http://localhost:3000/login](http://localhost:3000/login)

   2. Then give yourself lots of credits. Be generous, you're the boss now!

   ```bash
   bun run start-studio
   ```

   Then, navigate to https://local.drizzle.studio/

   Edit your row in the `credit_ledger` table to set the `principal` to whatever you like and the `balance` to equal it.

   Now, you should be able to run the CLI commands locally from within the `openbuff` directory.

7. **Running in other directories**:

In order to run the CLI from other directories, you need to first publish the agents to the database.

- First, create a publisher profile at http://localhost:3000/publishers. Make sure the `publisher_id` is `codebuff`.

- Run:

  ```bash
  bun run start-cli publish base
  ```

- It will give you an error along the lines of `Invalid agent ID: [some agent ID]`, e.g. `Invalid agent ID: context-pruner`. You need to publish that agent at the same time, e.g.:

  ```bash
  bun run start-cli publish base context-pruner
  ```

- Repeat this until there are no more errors.
  - As of the time of writing, the command required is:

  ```bash
  bun start-cli publish base context-pruner file-explorer file-picker researcher thinker reviewer
  ```

- Now, you can start the CLI in any directory by running:

  ```bash
  bun run start-cli --cwd [some/other/directory]
  ```

## Understanding the Codebase

Openbuff is organized as a monorepo with these main packages:

- **web/**: Next.js web application and dashboard
- **cli/**: CLI application that users interact with
- **python-app/**: Python version of the CLI (experimental)
- **common/**: Shared code, database schemas, utilities
- **sdk/**: TypeScript SDK for programmatic usage
- **agents/**: Agent definition files and templates
- **packages/**: Internal packages (billing, bigquery, etc.)
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

### 🌐 **Web Dashboard**

Improve `web/`: agent management, project templates, analytics.

## Getting Help

**Setup issues?**

- **Script errors?** Double-check you're using bun for all commands
- **Database connection errors?** If you see `password authentication failed for user "postgres"` errors:
  1. Ensure DATABASE_URL in `.env.local` uses the correct credentials: `postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local`
  2. Run the database migration: `bun run db:migrate`
  3. Restart your development services
- **Using Infisical?** See the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md) for team secrets management
- **Empty Agent Store in dev mode?** This is expected behavior - agents from `.agents/` directory need to be published to the database to appear in the marketplace

**Questions?** Open a [GitHub Issue](https://github.com/AnzoBenjamin/openbuff/issues) - we're friendly and always happy to help!

## Resources

- **Documentation**: See the [docs/](./docs) directory and [AGENTS.md](./AGENTS.md)
- **Community & Support**: [GitHub Issues](https://github.com/AnzoBenjamin/openbuff/issues)
- **Report issues**: [GitHub Issues](https://github.com/AnzoBenjamin/openbuff/issues)
