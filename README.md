# Codebuff

Codebuff is an AI coding assistant that edits your codebase through natural language instructions. Instead of using one model for everything, it coordinates specialized agents that work together to understand your project and make precise changes.

Codebuff beats Claude Code at 61% vs 53% on [our internal evals](evals/README.md) across 200+ coding tasks over multiple open-source repos that simulate real-world tasks.

![Codebuff Demo](./assets/demo.gif)

## How it works

When you ask Codebuff to "add authentication to my API," it might invoke:

1. A **File Explorer Agent** scans your codebase to understand the architecture and find relevant files
2. An **Planner Agent** plans which files need changes and in what order
3. An **Implementation Agents** make precise edits
4. A **Review Agents** validate changes

<img src="./assets/multi-agents.png" alt="Codebuff Multi-Agents" style="max-height: 400px;">

This multi-agent approach gives you better context understanding, more accurate edits, and fewer errors compared to single-model tools.

## CLI: Install and start coding

```bash
npm install -g codebuff
cd your-project
codebuff
```

Then just tell Codebuff what you want and it handles the rest:

- "Fix the SQL injection vulnerability in user registration"
- "Add rate limiting to all API endpoints"
- "Refactor the database connection code for better performance"

Codebuff will find the right files, makes changes across your codebase, and runs tests to make sure nothing breaks.

### Create custom agents

You can create specialized agents for your workflows using TypeScript generators for more programmatic control.

For example, here's a `git-committer` agent that creates git commits based on the current git state. Notice that it runs `git diff` and `git log` to analyze changes, but then hands control over to the LLM to craft a meaningful commit messagea and perform the actual commit.

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

## SDK: Build custom AI coding tools

```typescript
import { CodebuffClient } from 'codebuff'

// Initialize the client
const client = new CodebuffClient({
  apiKey: 'your-api-key',
  cwd: '/path/to/your/project',
  onError: (error) => console.error('Codebuff error:', error.message),
})

// Run a task, like adding error handling to all API endpoints
const result = await client.run({
  prompt: 'Add comprehensive error handling to all API endpoints',
  agent: 'base',
  handleEvent: (event) => {
    console.log('Progress:', event)
  },
})
```

Learn more about the SDK [here](https://www.npmjs.com/package/@codebuff/sdk).

## Why choose Codebuff

**Any model on OpenRouter**: Unlike Claude Code which locks you into Anthropic's models, Codebuff supports any model available on [OpenRouter](https://openrouter.ai/models) - from Claude and GPT to specialized models like Qwen, DeepSeek, and others. Switch models for different tasks or use the latest releases without waiting for platform updates.

**Deep customizability**: Create sophisticated agent workflows with TypeScript generators that mix AI generation with programmatic control. Define custom agents that spawn subagents, implement conditional logic, and orchestrate complex multi-step processes that adapt to your specific use cases.

**Fully customizable SDK**: Build Codebuff's capabilities directly into your applications with a complete TypeScript SDK. Create custom tools, integrate with your CI/CD pipeline, build AI-powered development environments, or embed intelligent coding assistance into your products.

## Get started

### Install

**CLI**: `npm install -g codebuff`

**SDK**: `npm install @codebuff/sdk`

### Resources

**Running Codebuff locally**: [local-development.md](./local-development.md)

**Documentation**: [codebuff.com/docs](https://codebuff.com/docs)

**Community**: [Discord](https://codebuff.com/discord)

**Support**: [support@codebuff.com](mailto:support@codebuff.com)
