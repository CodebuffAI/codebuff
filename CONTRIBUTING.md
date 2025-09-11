# Contributing to Codebuff

Hey there! 👋 Thanks for wanting to contribute to Codebuff. Whether you're squashing bugs, building cool features, or making our docs better, we're excited to have you aboard!

## Getting Started

### Prerequisites

Before you begin, you'll need to install a few tools:

1. **Bun** (our primary package manager): Follow the [Bun installation guide](https://bun.sh/docs/installation)
2. **direnv**: This manages environment variables automatically
   - macOS: `brew install direnv`
   - Ubuntu/Debian: `sudo apt install direnv`
   - Other systems: See [direnv installation guide](https://direnv.net/docs/installation.html)
3. **Docker**: Required for the web server database
4. **Infisical CLI**: For secrets management
   ```bash
   npm install -g @infisical/cli
   ```

### Setting Up Your Development Environment

1. **Hook direnv into your shell** (one-time setup):

   - For zsh: `echo 'eval "$(direnv hook zsh)"' >> ~/.zshrc && source ~/.zshrc`
   - For bash: `echo 'eval "$(direnv hook bash)"' >> ~/.bashrc && source ~/.bashrc`
   - For fish: `echo 'direnv hook fish | source' >> ~/.config/fish/config.fish && source ~/.config/fish/config.fish`

2. **Restart your shell**: Run `exec $SHELL` or restart your terminal

3. **Clone the repository**:

   ```bash
   git clone https://github.com/CodebuffAI/codebuff.git
   cd codebuff
   ```

4. **Set up secrets management**:

   ```bash
   npm install -g @infisical/cli
   infisical init
   infisical login
   # Select "US" region when prompted
   ```

   Follow the [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md) for detailed setup instructions.

   Load all environment variables at once:
   ```bash
   infisical secrets set --file .env.example
   infisical secrets set DATABASE_URL=postgresql://postgres:secretpassword_local@localhost:5432/codebuff
   ```

5. **Configure environment**:

   ```bash
   direnv allow
   ```

6. **Install dependencies**:

   ```bash
   bun install
   ```

7. **Start development services** (requires 3 terminals):

   ```bash
   # Terminal 1 - Backend server (start first)
   bun run start-server
   # Expected: 🚀 Server is running on port 4242

   # Terminal 2 - Web server (start second)
   bun run start-web
   # Expected: Ready on http://localhost:3000

   # Terminal 3 - CLI client (start last)
   bun run start-bin
   # Expected: Welcome to Codebuff! + agent list
   ```

   **Note**: CLI requires both backend and web server running for authentication.

## Understanding the Codebase

Codebuff is organized as a monorepo with these main packages:

- **backend/**: WebSocket server, LLM integration, agent orchestration
- **npm-app/**: CLI application that users interact with
- **web/**: Next.js web application and dashboard
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

Add new capabilities in `backend/src/tools.ts` - file operations, API integrations, development environment helpers. The sky's the limit!

### 📦 **SDK Improvements**

Make the SDK in `sdk/` even more powerful with new methods, better TypeScript support, or killer integration examples.

### 💻 **CLI Magic**

Enhance the user experience in `npm-app/` with smoother commands, better error messages, or interactive features that make developers smile.

### 🌐 **Web Dashboard**

Level up the web interface in `web/` with better agent management, project templates, analytics, or any UX improvements you can dream up.

## Getting Help

**Setup issues?**

- **direnv problems?** Make sure it's hooked into your shell, run `direnv allow`, and restart your terminal
- **Script errors?** Double-check you're using bun for all commands
- **Infisical issues?** See our [Infisical Setup Guide](./INFISICAL_SETUP_GUIDE.md) for step-by-step instructions

**Questions?** Jump into our [Discord community](https://codebuff.com/discord) - we're friendly and always happy to help!

## Resources

- **Documentation**: [codebuff.com/docs](https://codebuff.com/docs)
- **Community Discord**: [codebuff.com/discord](https://codebuff.com/discord)
- **Report issues**: [GitHub Issues](https://github.com/CodebuffAI/codebuff/issues)
