# Custom Agents

Create specialized agent workflows that coordinate multiple AI agents to tackle complex engineering tasks. Instead of a single agent trying to handle everything, you can orchestrate teams of focused specialists that work together.

## Context Window Management

### Why Agent Workflows?

Modern software projects are complex ecosystems with thousands of files, multiple frameworks, intricate dependencies, and domain-specific requirements. A single AI agent trying to understand and modify such systems faces fundamental limitations—not just in knowledge, but in the sheer volume of information it can process at once.

### The Solution: Focused Context Windows

Agent workflows elegantly solve this by breaking large tasks into focused sub-problems. When working with large codebases (100k+ lines), each specialist agent receives only the narrow context it needs—a security agent sees only auth code, not UI components—keeping the context for each agent manageable while ensuring comprehensive coverage.

### Why Not Just Mimic Human Roles?

This is about efficient AI context management, not recreating a human department. Simply creating a "frontend-developer" agent misses the point. AI agents don't have human constraints like context-switching or meetings. Their power comes from hyper-specialization, allowing them to process a narrow domain more deeply than a human could, then coordinating seamlessly with other specialists.

## Agent workflows in action

Here's an example of a `payment-architect` agent that coordinates a complete workflow. When you ask it to implement payment processing, it orchestrates:

- **Code analysis**: Reviews existing payment patterns and database schema
- **Security audit**: Spawns security specialists to review PCI compliance and data handling
- **Performance review**: Analyzes transaction volume and caching strategies
- **Integration testing**: Ensures compatibility with existing checkout flows
- **Documentation**: Updates API docs and integration guides

Each specialist agent brings domain expertise that no single agent could match.

```typescript
export default {
  name: 'payment-architect',
  model: 'claude-3-5-sonnet',
  spawnableAgents: [
    'security-auditor',
    'performance-analyzer',
    'integration-tester',
  ],

  async *handleSteps() {
    // First, understand the current payment infrastructure
    yield { tool: 'code_search', pattern: 'payment.*process' }
    yield 'STEP'

    // Coordinate specialist review
    yield {
      tool: 'spawn_agents',
      agents: [
        'security-auditor', // PCI compliance and data protection
        'performance-analyzer', // Transaction throughput analysis
        'integration-tester', // Checkout flow compatibility
      ],
    }
    yield 'STEP_ALL'

    // Implement based on specialist feedback
    yield 'STEP'
  },
}
```

This workflow ensures every payment implementation gets the specialized attention it needs - security review for compliance, performance analysis for scale, and integration testing for reliability.

## Getting started

Edit `my-custom-agent.ts` with your team's patterns, then run `codebuff --agent my-custom-agent` to test it.

For detailed documentation, see [agent-guide.md](./agent-guide.md).
For examples, check the `examples/` directory.
For help, join our [Discord community](https://codebuff.com/discord).
