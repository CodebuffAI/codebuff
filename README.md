# Codebirds

English | [简体中文](./README.zh-CN.md)

**Codebirds** is an open-source AI coding assistant that edits your codebase through natural language instructions.

<div align="center">
  <img src="./assets/codebirds-vs-claude-code.png" alt="Codebirds vs Claude Code" width="400">
</div>

Codebirds beats Claude Code at 61% vs 53% on [our evals](evals/README.md) across 175+ coding tasks over multiple open-source repos that simulate real-world tasks.

## Key Features

- **File mentions** — Use `@filename` to reference specific files
- **Agent mentions** — Use `@AgentName` to invoke specialized agents
- **Bash mode** — Run terminal commands with `!command` or `/bash`
- **Chat history** — Resume past conversations with `/history`
- **Knowledge files** — Add `knowledge.md` to your project for context
- **Themes** — Toggle light/dark mode with `/theme:toggle`

### Commands

| Command         | Description                      |
| --------------- | -------------------------------- |
| `/help`         | Show keyboard shortcuts and tips |
| `/new`          | Start a new conversation         |
| `/history`      | Browse past conversations        |
| `/bash`         | Enter bash mode                  |
| `/init`         | Create a starter knowledge.md    |
| `/feedback`     | Share feedback                   |
| `/theme:toggle` | Toggle light/dark mode           |
| `/logout`       | Sign out                         |
| `/exit`         | Quit                             |

---

This README covers **Codebirds** — its multi-agent architecture, custom agents, and SDK.

## How it works

When you ask Codebirds to "add authentication to my API," it might invoke:

1. A **File Picker Agent** to scan your codebase to understand the architecture and find relevant files
2. A **Planner Agent** to plan which files need changes and in what order
3. An **Editor Agent** to make precise edits
4. A **Reviewer Agent** to validate changes

<div align="center">
  <img src="./assets/multi-agents.png" alt="Codebirds Multi-Agents" width="250">
</div>

This multi-agent approach gives you better context understanding, more accurate edits, and fewer errors compared to single-model tools.

## CLI: Install and start coding

Install:

```bash
npm install -g codebirds
```

Run:

```bash
cd your-project
codebirds
```

Then just tell Codebirds what you want and it handles the rest:

- "Fix the SQL injection vulnerability in user registration"
- "Add rate limiting to all API endpoints"
- "Refactor the database connection code for better performance"

Codebirds will find the right files, makes changes across your codebase, and runs tests to make sure nothing breaks.

## Create custom agents

To get started building your own agents, start Codebirds and run the `/init` command:

```bash
codebirds
```

Then inside the CLI:

```
/init
```

This creates:
```
knowledge.md               # Project context for Codebirds
.agents/
└── types/                 # TypeScript type definitions
    ├── agent-definition.ts
    ├── tools.ts
    └── util-types.ts
```

You can write agent definition files that give you maximum control over agent behavior.

Implement your workflows by specifying tools, which agents can be spawned, and prompts. We even have TypeScript generators for more programmatic control.

For example, here's a `git-committer` agent that creates git commits based on the current git state. Notice that it runs `git diff` and `git log` to analyze changes, but then hands control over to the LLM to craft a meaningful commit message and perform the actual commit.

```typescript
export default {
  id: 'git-committer',
  displayName: 'Git Committer',
  model: 'openai/gpt-5-nano',
  toolNames: ['read_files', 'run_terminal_command', 'end_turn'],

  instructionsPrompt:
    'You create meaningful git commits by analyzing changes, reading relevant files for context, and crafting clear commit messages that explain the "why" behind changes.',

  async *handleSteps() {
    // Analyze what changed
    yield { tool: 'run_terminal_command', command: 'git diff' }
    yield { tool: 'run_terminal_command', command: 'git log --oneline -5' }

    // Stage files and create commit with good message
    yield 'STEP_ALL'
  },
}
```

## SDK: Run agents in production

Install the [SDK package](https://www.npmjs.com/package/@codebirds/sdk) -- note this is different than the CLI codebirds package.

```bash
npm install @codebirds/sdk
```

Import the client and run agents!

```typescript
import { CodebirdsClient } from '@codebirds/sdk'

// 1. Initialize the client
const client = new CodebirdsClient({
  apiKey: 'your-api-key',
  cwd: '/path/to/your/project',
  onError: (error) => console.error('Codebirds error:', error.message),
})

// 2. Do a coding task...
const result = await client.run({
  agent: 'base', // Codebirds' base coding agent
  prompt: 'Add error handling to all API endpoints',
  handleEvent: (event) => {
    console.log('Progress', event)
  },
})

// 3. Or, run a custom agent!
const myCustomAgent: AgentDefinition = {
  id: 'greeter',
  displayName: 'Greeter',
  model: 'openai/gpt-5.1',
  instructionsPrompt: 'Say hello!',
}
await client.run({
  agent: 'greeter',
  agentDefinitions: [myCustomAgent],
  prompt: 'My name is Bob.',
  customToolDefinitions: [], // Add custom tools too!
  handleEvent: (event) => {
    console.log('Progress', event)
  },
})
```

Learn more about the SDK [here](https://www.npmjs.com/package/@codebirds/sdk).

## Why choose Codebirds

**Custom workflows**: TypeScript generators let you mix AI generation with programmatic control. Agents can spawn subagents, branch on conditions, and run multi-step processes.

**Any model on OpenRouter**: Unlike Claude Code which locks you into Anthropic's models, Codebirds supports any model available on [OpenRouter](https://openrouter.ai/models) - from Claude and GPT to specialized models like Qwen, DeepSeek, and others. Switch models for different tasks or use the latest releases without waiting for platform updates.

**Reuse any published agent**: Compose existing [published agents](https://www.codebirds.com/store) to get a leg up. Codebirds agents are the new MCP!

**SDK**: Build Codebirds into your applications. Create custom tools, integrate with CI/CD, or embed coding assistance into your products.

## Advanced Usage

### Custom Agent Workflows

Create your own agents with specialized workflows using the `/init` command:

```bash
codebirds
/init
```

This creates a custom agent structure in `.agents/` that you can customize.

## Contributing to Codebirds

We ❤️ contributions from the community - whether you're fixing bugs, tweaking our agents, or improving documentation.

**Want to contribute?** Check out our [Contributing Guide](./CONTRIBUTING.md) to get started.

### Running Tests

To run the test suite:

```bash
cd cli
bun test
```

**For interactive E2E testing**, install tmux:

```bash
# macOS
brew install tmux

# Ubuntu/Debian
sudo apt-get install tmux

# Windows (via WSL)
wsl --install
sudo apt-get install tmux
```

See [cli/src/__tests__/README.md](cli/src/__tests__/README.md) for comprehensive testing documentation.

Some ways you can help:

- 🐛 **Fix bugs** or add features
- 🤖 **Create specialized agents** and publish them to the Agent Store
- 📚 **Improve documentation** or write tutorials
- 💡 **Share ideas** in our [GitHub Issues](https://github.com/CodebirdsAI/codebirds/issues)

## Get started

### Install

**CLI**: `npm install -g codebirds`

**SDK**: `npm install @codebirds/sdk`

### Resources

**Documentation**: [codebirds.com/docs](https://codebirds.com/docs)

**Community**: [Discord](https://codebirds.com/discord)

**Issues & Ideas**: [GitHub Issues](https://github.com/CodebirdsAI/codebirds/issues)

**Contributing**: [CONTRIBUTING.md](./CONTRIBUTING.md) - Start here to contribute!

**Support**: [support@codebirds.com](mailto:support@codebirds.com)

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=CodebirdsAI/codebirds&type=Date)](https://www.star-history.com/#CodebirdsAI/codebirds&Date)
