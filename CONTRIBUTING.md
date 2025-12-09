# Contributing to Codebuff

Hey there! 👋 Thanks for wanting to contribute to Codebuff. Whether you're squashing bugs, building cool features, or making our docs better, we're excited to have you aboard!

## Getting Started

### Prerequisites

Before you begin, you'll need to install a few tools:

1. **Bun** (our primary package manager): Follow the [Bun installation guide](https://bun.sh/docs/installation)
2. **Docker**: Required for the web server database

### Setting Up Your Development Environment

1. **Clone the repository**:

   ```bash
   git clone https://github.com/CodebuffAI/codebuff.git
   cd codebuff
   ```

2. **Set up environment variables**:

   ```bash
   # Copy the example file
   cp .env.example .env.local
   
   # Edit .env.local and update DATABASE_URL to match Docker:
   # DATABASE_URL=postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local
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

   **Option A: All-in-one (recommended)**

   ```bash
   bun run dev
   # Starts the web server, builds the SDK, and launches the CLI automatically
   ```

   **Option B: Separate terminals (for more control)**

   ```bash
   # Terminal 1 - Web server (start first)
   bun run start-web
   # Expected: Ready on http://localhost:3000

   # Terminal 2 - CLI client (requires web server to be running first)
   bun run start-cli
   # Expected: Welcome to Codebuff! + agent list
   ```

   Now, you should be able to run the CLI and send commands, but it will error out because you don't have any credits.

   **Note**: CLI requires the web server running for authentication.

6. **Giving yourself credits**:

   1. Log into Codebuff at [http://localhost:3000/login](http://localhost:3000/login)

   2. Then give yourself lots of credits. Be generous, you're the boss now!

   ```bash
   bun run start-studio
   ```

   Then, navigate to https://local.drizzle.studio/

   Edit your row in the `credit_ledger` table to set the `principal` to whatever you like and the `balance` to equal it.

   Now, you should be able to run the CLI commands locally from within the `codebuff` directory.

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

Codebuff is organized as a monorepo with these main packages:

- **web/**: Next.js web application and dashboard
- **cli/**: CLI application that users interact with
- **python-app/**: Python version of the CLI (experimental)
- **common/**: Shared code, database schemas, utilities
- **sdk/**: TypeScript SDK for programmatic usage
- **.agents/**: Agent definition files and templates
- **packages/**: Internal packages (billing, bigquery, etc.)
- **evals/**: Evaluation framework and benchmarks

## Making Contributions

### Finding Something to Work On

Not sure where to start? Here are some great ways to jump in:

- **New here?** Look for issues labeled `good first issue` - they're perfect for getting familiar with the codebase
- **Ready for more?** Check out `help wanted` issues where we could really use your expertise
- **Have an idea?** Browse open issues or create a new one to discuss it
- **Want to chat?** Join our [Discord](https://codebuff.com/discord) - the team loves discussing new ideas!

### Development Workflow

Here's how we like to work together:

1. **Fork and branch** - Create your own fork and a new branch for your changes
2. **Code away** - Follow our style guidelines (more on that below)
3. **Test it** - Write tests for new features and run `bun test` to make sure everything works
4. **Type check** - Run `bun run typecheck` to catch any TypeScript issues
5. **Submit a PR** - Open a pull request with a clear description of what you built and why

_Pro tip: Small, focused PRs are easier to review and merge quickly!_

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

There are tons of ways to make Codebuff better! Here are some areas where your skills could really shine:

### 🤖 **Agent Development**

Build specialized agents in `.agents/` for different languages, frameworks, or workflows. Think React experts, Python debuggers, or Git wizards!

### 🔧 **Tool System**

Add new capabilities in `common/src/tools` and the SDK helpers - file operations, API integrations, development environment helpers. The sky's the limit!

### 📦 **SDK Improvements**

Make the SDK in `sdk/` even more powerful with new methods, better TypeScript support, or killer integration examples.

### 💻 **CLI Magic**

Enhance the user experience in `cli/` with smoother commands, better error messages, or interactive features that make developers smile.

### 🌐 **Web Dashboard**

Level up the web interface in `web/` with better agent management, project templates, analytics, or any UX improvements you can dream up.

## Getting Help

**Setup issues?**

- **Script errors?** Double-check you're using bun for all commands
- **Database connection errors?** If you see `password authentication failed for user "postgres"` errors:
  1. Ensure DATABASE_URL in `.env.local` uses the correct credentials: `postgresql://manicode_user_local:secretpassword_local@localhost:5432/manicode_db_local`
  2. Run the database migration: `bun run db:migrate`
  3. Restart your development services
- **Using Infisical?** See the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md) for team secrets management
- **Empty Agent Store in dev mode?** This is expected behavior - agents from `.agents/` directory need to be published to the database to appear in the marketplace

**Questions?** Jump into our [Discord community](https://codebuff.com/discord) - we're friendly and always happy to help!

## Resources

- **Documentation**: [codebuff.com/docs](https://codebuff.com/docs)
- **Community Discord**: [codebuff.com/discord](https://codebuff.com/discord)
- **Report issues**: [GitHub Issues](https://github.com/CodebuffAI/codebuff/issues)
