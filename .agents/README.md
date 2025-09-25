# Custom Agents

Create specialized agent workflows that coordinate multiple AI agents to tackle complex engineering tasks. Instead of a single agent trying to handle everything, you can orchestrate teams of focused specialists that work together.

## Getting Started

1. **Edit an existing agent**: Start with `my-custom-agent.ts` and modify it for your needs
2. **Test your agent**: Run `codebuff --agent your-agent-name`
3. **Publish your agent**: Run `codebuff publish your-agent-name`

## Need Help?

- For examples, check the `examples/` directory.
- Join our [Discord community](https://codebuff.com/discord) and ask your questions!
- Check our [documentation](https://codebuff.com/docs) for more details

# What is Codebuff?

Codebuff is an **open-source AI coding assistant** that edits your codebase through natural language instructions. Instead of using one model for everything, it coordinates specialized agents that work together to understand your project and make precise changes.

Codebuff beats Claude Code at 61% vs 53% on [our evals](https://github.com/CodebuffAI/codebuff/tree/main/evals) across 175+ coding tasks over multiple open-source repos that simulate real-world tasks.

## How Codebuff Works

When you ask Codebuff to "add authentication to my API," it might invoke:

1. A **File Explorer Agent** to scan your codebase to understand the architecture and find relevant files
2. A **Planner Agent** to plan which files need changes and in what order
3. An **Editor Agent** to make precise edits
4. A **Reviewer Agent** to validate changes

This multi-agent approach gives you better context understanding, more accurate edits, and fewer errors compared to single-model tools.

## Context Window Management

### Why Agent Workflows?

Modern software projects are complex ecosystems with thousands of files, multiple frameworks, intricate dependencies, and domain-specific requirements. A single AI agent trying to understand and modify such systems faces fundamental limitations—not just in knowledge, but in the sheer volume of information it can process at once.

### The Solution: Focused Context Windows

Agent workflows elegantly solve this by breaking large tasks into focused sub-problems. When working with large codebases (100k+ lines), each specialist agent receives only the narrow context it needs—a security agent sees only auth code, not UI components—keeping the context for each agent manageable while ensuring comprehensive coverage.

### Why Not Just Mimic Human Roles?

This is about efficient AI context management, not recreating a human department. Simply creating a "frontend-developer" agent misses the point. AI agents don't have human constraints like context-switching or meetings. Their power comes from hyper-specialization, allowing them to process a narrow domain more deeply than a human could, then coordinating seamlessly with other specialists.

## Agent workflows in action

Here's an example of a `git-committer` agent that creates good commit messages:

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

This agent systematically analyzes changes, reads relevant files for context, then creates commits with clear, meaningful messages that explain the "why" behind changes.

# Agent Development Guide

This guide covers everything you need to know about building custom Codebuff agents.

## Agent Structure

Each agent is a TypeScript file that exports an `AgentDefinition` object:

```typescript
export default {
  id: 'my-agent', // Unique identifier (lowercase, hyphens only)
  displayName: 'My Agent', // Human-readable name
  model: 'claude-3-5-sonnet', // AI model to use
  toolNames: ['read_files', 'write_file'], // Available tools
  instructionsPrompt: 'You are...', // Agent behavior instructions
  spawnerPrompt: 'Use this agent when...', // When others should spawn this
  spawnableAgents: ['helper-agent'], // Agents this can spawn

  // Optional: Programmatic control
  async *handleSteps() {
    yield { tool: 'read_files', paths: ['src/config.ts'] }
    yield 'STEP' // Let AI process and respond
  },
}
```

## Core Properties

### Required Fields

- **`id`**: Unique identifier using lowercase letters and hyphens only
- **`displayName`**: Human-readable name shown in UI
- **`model`**: AI model from OpenRouter (see [available models](https://openrouter.ai/models))
- **`instructionsPrompt`**: Detailed instructions defining the agent's role and behavior

### Optional Fields

- **`toolNames`**: Array of tools the agent can use (defaults to common tools)
- **`spawnerPrompt`**: Instructions for when other agents should spawn this one
- **`spawnableAgents`**: Array of agent names this agent can spawn
- **`handleSteps`**: Generator function for programmatic control

## Available Tools

### File Operations

- **`read_files`**: Read file contents
- **`write_file`**: Create or modify entire files
- **`str_replace`**: Make targeted string replacements
- **`code_search`**: Search for patterns across the codebase

### Execution

- **`run_terminal_command`**: Execute shell commands
- **`spawn_agents`**: Delegate tasks to other agents
- **`end_turn`**: Finish the agent's response

### Web & Research

- **`web_search`**: Search the internet for information
- **`read_docs`**: Read technical documentation
- **`browser_logs`**: Navigate and inspect web pages

See `types/tools.ts` for detailed parameter information.

## Programmatic Control

Use the `handleSteps` generator function to mix AI reasoning with programmatic logic:

```typescript
async *handleSteps() {
  // Execute a tool
  yield { tool: 'read_files', paths: ['package.json'] }

  // Let AI process results and respond
  yield 'STEP'

  // Conditional logic
  if (needsMoreAnalysis) {
    yield { tool: 'spawn_agents', agents: ['deep-analyzer'] }
    yield 'STEP_ALL' // Wait for spawned agents to complete
  }

  // Final AI response
  yield 'STEP'
}
```

### Control Commands

- **`'STEP'`**: Let AI process and respond once
- **`'STEP_ALL'`**: Let AI continue until completion
- **Tool calls**: `{ tool: 'tool_name', ...params }`

## Model Selection

Choose models based on your agent's needs:

- **`anthropic/claude-sonnet-4`**: Best for complex reasoning and code generation
- **`openai/gpt-5`**: Strong general-purpose capabilities
- **`x-ai/grok-4-fast`**: Fast and cost-effective for simple or medium-complexity tasks

**Any model on OpenRouter**: Unlike Claude Code which locks you into Anthropic's models, Codebuff supports any model available on [OpenRouter](https://openrouter.ai/models) - from Claude and GPT to specialized models like Qwen, DeepSeek, and others. Switch models for different tasks or use the latest releases without waiting for platform updates.

See [OpenRouter](https://openrouter.ai/models) for all available models and pricing.

## Agent Coordination

Agents can spawn other agents to create sophisticated workflows:

```typescript
// Parent agent spawns specialists
async *handleSteps() {
  yield { tool: 'spawn_agents', agents: [
    'security-scanner',
    'performance-analyzer',
    'code-reviewer'
  ]}
  yield 'STEP_ALL' // Wait for all to complete

  // Synthesize results
  yield 'STEP'
}
```

**Reuse any published agent**: Compose existing [published agents](https://www.codebuff.com/store) to get a leg up. Codebuff agents are the new MCP!

## Best Practices

### Instructions

- Be specific about the agent's role and expertise
- Include examples of good outputs
- Specify when the agent should ask for clarification
- Define the agent's limitations

### Tool Usage

- Start with file exploration tools (`read_files`, `code_search`)
- Use `str_replace` for targeted edits, `write_file` for major changes
- Always use `end_turn` to finish responses cleanly

### Error Handling

- Include error checking in programmatic flows
- Provide fallback strategies for failed operations
- Log important decisions for debugging

### Performance

- Choose appropriate models for the task complexity
- Minimize unnecessary tool calls
- Use spawnable agents for parallel processing

## Testing Your Agent

1. **Local Testing**: `codebuff --agent your-agent-name`
2. **Debug Mode**: Add logging to your `handleSteps` function
3. **Unit Testing**: Test individual functions in isolation
4. **Integration Testing**: Test agent coordination workflows

## Publishing & Sharing

1. **Validate**: Ensure your agent works across different codebases
2. **Document**: Include clear usage instructions
3. **Publish**: `codebuff publish your-agent-name`
4. **Maintain**: Update as models and tools evolve

## Advanced Patterns

### Conditional Workflows

```typescript
async *handleSteps() {
  const config = yield { tool: 'read_files', paths: ['config.json'] }
  yield 'STEP'

  if (config.includes('typescript')) {
    yield { tool: 'spawn_agents', agents: ['typescript-expert'] }
  } else {
    yield { tool: 'spawn_agents', agents: ['javascript-expert'] }
  }
  yield 'STEP_ALL'
}
```

### Iterative Refinement

```typescript
async *handleSteps() {
  for (let attempt = 0; attempt < 3; attempt++) {
    yield { tool: 'run_terminal_command', command: 'npm test' }
    yield 'STEP'

    if (allTestsPass) break

    yield { tool: 'spawn_agents', agents: ['test-fixer'] }
    yield 'STEP_ALL'
  }
}
```

## Why Choose Codebuff for Custom Agents

**Deep customizability**: Create sophisticated agent workflows with TypeScript generators that mix AI generation with programmatic control. Define custom agents that spawn subagents, implement conditional logic, and orchestrate complex multi-step processes that adapt to your specific use cases.

**Fully customizable SDK**: Build Codebuff's capabilities directly into your applications with a complete TypeScript SDK. Create custom tools, integrate with your CI/CD pipeline, build AI-powered development environments, or embed intelligent coding assistance into your products.

Learn more about the SDK [here](https://www.npmjs.com/package/@codebuff/sdk).

## Community & Support

- **Discord**: [Join our community](https://codebuff.com/discord) for help and inspiration
- **Examples**: Study the `examples/` directory for patterns
- **Documentation**: [codebuff.com/docs](https://codebuff.com/docs) and check `types/` for detailed type information
- **Issues**: [Report bugs and request features on GitHub](https://github.com/CodebuffAI/codebuff/issues)
- **Support**: [support@codebuff.com](mailto:support@codebuff.com)

Happy agent building! 🤖
