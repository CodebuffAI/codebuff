# Agent Development Guide

This guide covers everything you need to know about building custom Codebuff agents.

## Agent Structure

Each agent is a TypeScript file that exports an `AgentDefinition` object:

```typescript
export default {
  id: 'my-agent',              // Unique identifier (lowercase, hyphens only)
  displayName: 'My Agent',     // Human-readable name
  model: 'claude-3-5-sonnet',  // AI model to use
  toolNames: ['read_files', 'write_file'], // Available tools
  instructionsPrompt: 'You are...', // Agent behavior instructions
  spawnerPrompt: 'Use this agent when...', // When others should spawn this
  spawnableAgents: ['helper-agent'], // Agents this can spawn
  
  // Optional: Programmatic control
  async *handleSteps() {
    yield { tool: 'read_files', paths: ['src/config.ts'] }
    yield 'STEP' // Let AI process and respond
  }
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

- **`claude-3-5-sonnet`**: Best for complex reasoning and code generation
- **`gpt-4`**: Strong general-purpose capabilities
- **`claude-3-haiku`**: Fast and cost-effective for simple tasks
- **`gemini-pro`**: Good for analysis and research tasks

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

## Troubleshooting

### Common Issues
- **Agent not spawning**: Check the `id` format (lowercase, hyphens only)
- **Tool errors**: Verify tool parameters match the expected schema
- **Infinite loops**: Always include exit conditions in loops
- **Memory issues**: Avoid storing large objects in generator state

### Debugging Tips
- Use `console.log` in `handleSteps` for debugging
- Test individual tool calls before adding to workflows
- Start simple and add complexity gradually

## Community & Support

- **Discord**: Join our community for help and inspiration
- **Examples**: Study the `examples/` directory for patterns
- **Documentation**: Check `types/` for detailed type information
- **Issues**: Report bugs and request features on GitHub

Happy agent building! 🤖