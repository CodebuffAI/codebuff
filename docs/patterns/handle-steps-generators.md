# handleSteps Generator Pattern for Programmatic Agents

When creating agents that use `handleSteps` generators to programmatically execute tool calls, follow these exact patterns to avoid TypeScript compilation errors.

## Correct handleSteps Signature

```typescript
import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  // ... other fields
  
  handleSteps: function* ({ agentState, prompt, params }) {
    // Generator body
  },
}
```

## Yielding Tool Calls

Yield objects with `toolName` and `input` properties. The input schema must match the tool's expected parameters exactly.

### spawn_agents Tool

```typescript
handleSteps: function* ({ agentState, prompt, params }) {
  const promptWithDefault = prompt ?? 'Default prompt'
  
  yield {
    toolName: 'spawn_agents',
    input: {
      agents: [
        {
          agent_type: 'agent-id-1',
          prompt: promptWithDefault,
        },
        {
          agent_type: 'agent-id-2', 
          prompt: promptWithDefault,
        },
      ],
    },
  }
  
  // After tool execution, yield 'STEP' to let the agent process results
  yield 'STEP'
},
```

### Common Mistakes

**WRONG:** Using incorrect property names or nested structures
```typescript
// ❌ Incorrect - wrong tool call structure
yield {
  type: 'tool_call',
  name: 'spawn_agents',
  arguments: { ... }
}
```

**WRONG:** Using `think_deeply` or custom tool names that don't exist
```typescript
// ❌ Incorrect - this tool doesn't exist
yield {
  toolName: 'think_deeply',
  input: { ... }
}
```

**CORRECT:** Use `toolName` and `input` at the top level
```typescript
// ✅ Correct
yield {
  toolName: 'spawn_agents',
  input: {
    agents: [{ agent_type: 'my-agent', prompt: 'Do something' }]
  }
}
```

## Yielding STEP

After yielding tool calls, yield the string `'STEP'` to let the main agent process the results:

```typescript
handleSteps: function* ({ prompt }) {
  yield {
    toolName: 'spawn_agents',
    input: { agents: [...] },
  }
  
  // This tells the runtime to run an LLM step to process spawn results
  yield 'STEP'
},
```

## Agent Definition Requirements for Spawning

Agents that spawn sub-agents must include:

1. `toolNames: ['spawn_agents']` - Enable the spawn tool
2. `spawnableAgents: ['agent-id-1', 'agent-id-2']` - List allowed sub-agents

```typescript
const definition: AgentDefinition = {
  id: 'coordinator',
  model: 'openai/gpt-5',
  toolNames: ['spawn_agents'],
  spawnableAgents: ['sub-agent-1', 'sub-agent-2', 'sub-agent-3'],
  // ...
}
```

## Complete Example: Multi-Model Coordinator

See `.agents/deep-thinking/deep-thinker.ts` for a working example:

```typescript
import type { AgentDefinition } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'deep-thinker',
  displayName: 'Deep Thinker Agent',
  model: 'openai/gpt-5',
  
  toolNames: ['spawn_agents'],
  spawnableAgents: ['gpt5-thinker', 'sonnet-thinker', 'gemini-thinker'],
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The topic to analyze',
    },
  },
  
  outputMode: 'last_message',
  
  handleSteps: function* ({ prompt }) {
    const promptWithDefault = prompt ?? 'Think about this topic'
    
    yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          { agent_type: 'gpt5-thinker', prompt: promptWithDefault },
          { agent_type: 'sonnet-thinker', prompt: promptWithDefault },
          { agent_type: 'gemini-thinker', prompt: promptWithDefault },
        ],
      },
    }
    
    yield 'STEP'
  },
}

export default definition
```

## Directory Structure

Place related agents in subdirectories under `.agents/`:

```
.agents/
└── deep-thinking/
    ├── deep-thinker.ts      # Coordinator
    ├── deepest-thinker.ts   # Meta-coordinator  
    ├── gpt5-thinker.ts      # Sub-agent
    ├── sonnet-thinker.ts    # Sub-agent
    └── gemini-thinker.ts    # Sub-agent
```

## Avoid Over-Engineering

When implementing agents:
- Only create files that are directly requested
- Don't add documentation files unless explicitly asked
- Keep agent definitions simple - use `AgentDefinition` type, not custom wrappers
- Don't create factory patterns unless there's clear reuse need