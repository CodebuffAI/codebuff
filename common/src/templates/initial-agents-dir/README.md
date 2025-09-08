# Custom Agents

Create specialized agent workflows that coordinate multiple AI agents to tackle complex engineering tasks. Instead of a single agent trying to handle everything, you can orchestrate teams of focused specialists that work together.

## Getting Started

1. **Edit an existing agent**: Start with `my-custom-agent.ts` and modify it for your needs
2. **Test your agent**: Run `codebuff --agent your-agent-name`
3. **Publish your agent**: Run `codebuff publish your-agent-name`

## Need Help?

- For detailed documentation, see [agent-guide.md](./agent-guide.md).
- For examples, check the `examples/` directory.
- Join our [Discord community](https://codebuff.com/discord) and ask your questions!

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
