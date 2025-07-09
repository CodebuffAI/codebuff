# Programmatic Agent Templates

This directory contains programmatic agent templates that allow you to create custom agents using JavaScript/TypeScript with generator functions.

## Overview

Programmatic agents provide a way to implement complex agent logic using JavaScript/TypeScript instead of relying solely on LLM prompts. They can:

- Orchestrate multiple sub-agents with conditional logic
- Implement iterative refinement workflows
- Use complex decision trees and control flow
- Maintain state across multiple tool calls
- Integrate seamlessly with existing LLM-based agents

## Directory Structure

```
.agents/
├── templates/
│   ├── orchestrator.js          # Example orchestrator agent
│   ├── orchestrator.json        # Configuration for orchestrator
│   ├── iterative-improver.js    # Example iterative improvement agent
│   ├── iterative-improver.json  # Configuration for iterative improver
│   └── your-agent.js            # Your custom agent
└── README.md                    # This file
```

## Creating a Programmatic Agent

### 1. Create the Handler Function

Create a JavaScript/TypeScript file with a generator function:

```javascript
// my-agent.js
async function* myAgent({ prompt, params }) {
  // Use yield to call tools
  const result = yield {
    toolName: 'spawn_agents',
    toolCallId: crypto.randomUUID(),
    args: {
      agents: [{
        agent_type: 'researcher',
        prompt: `Research: ${prompt}`,
        params: {}
      }]
    }
  };
  
  // Process the result
  const data = JSON.parse(result.result);
  
  // Return final result
  return {
    summary: 'Task completed',
    data: data,
    timestamp: new Date().toISOString()
  };
}

module.exports = myAgent;
```

### 2. Create the Configuration

Create a JSON configuration file:

```json
{
  "type": "YourOrg/my-agent",
  "implementation": "programmatic",
  "name": "My Custom Agent",
  "description": "Does custom logic",
  "version": "1.0.0",
  "handler": "./my-agent.js",
  "promptSchema": {
    "prompt": {
      "type": "string",
      "description": "The task to complete"
    },
    "params": {
      "type": "object",
      "properties": {
        "option": {
          "type": "string",
          "optional": true
        }
      }
    }
  },
  "outputMode": "report",
  "toolNames": ["spawn_agents", "read_files", "end_turn"],
  "spawnableAgents": ["base", "researcher", "file_picker"]
}
```

## Generator Function Interface

Your generator function receives a context object and yields tool calls:

```typescript
interface ProgrammaticAgentContext {
  prompt: string
  params: any
}

type ProgrammaticAgentFunction = (
  context: ProgrammaticAgentContext
) => AsyncGenerator<CodebuffToolCall, ProgrammaticAgentResult, ToolResult>
```

### Yielding Tool Calls

Use `yield` to execute tools:

```javascript
const result = yield {
  toolName: 'read_files',
  toolCallId: crypto.randomUUID(),
  args: {
    paths: ['src/index.ts', 'package.json']
  }
};

// result.result contains the tool output as a string
```

### Return Values

Return either:
- A string (for `last_message` output mode)
- An object (for `report` output mode)
- An object with `{ type: 'message', content: string }`
- An object with `{ type: 'report', data: object }`

## Available Tools

Your agent can use any tools specified in the `toolNames` array:

- `spawn_agents` - Spawn sub-agents
- `read_files` - Read project files
- `find_files` - Find relevant files
- `code_search` - Search code patterns
- `web_search` - Search the web
- `read_docs` - Read documentation
- `write_file` - Write/edit files
- `str_replace` - Replace text in files
- `run_terminal_command` - Run shell commands
- `browser_logs` - Get browser console logs
- `think_deeply` - Deep thinking
- `create_plan` - Create plans
- `add_subgoal` / `update_subgoal` - Manage subgoals
- `end_turn` - End the agent's turn

## Configuration Options

### Required Fields

- `type` - Unique identifier (e.g., "YourOrg/agent-name")
- `implementation` - Must be "programmatic"
- `name` - Human-readable name
- `description` - What the agent does
- `version` - Semantic version
- `handler` - Path to JS/TS file (relative to templates dir)
- `outputMode` - "report" or "last_message"
- `toolNames` - Array of allowed tools
- `spawnableAgents` - Array of agent types this agent can spawn

### Optional Fields

- `promptSchema` - Validation schema for prompt and params

## Examples

See the included examples:

- **orchestrator.js** - Demonstrates complex orchestration logic
- **iterative-improver.js** - Shows iterative refinement with feedback loops

## Best Practices

1. **Error Handling** - Wrap JSON.parse and other operations in try-catch
2. **Tool Validation** - Only use tools listed in your `toolNames`
3. **Agent Spawning** - Only spawn agents listed in `spawnableAgents`
4. **Resource Management** - Be mindful of token usage and API costs
5. **Logging** - Use meaningful variable names and comments
6. **Modularity** - Break complex logic into smaller functions

## Security Considerations

- Programmatic agents run in the same process as the backend
- They have access to the file system through tools only
- Tool usage is validated against the configuration
- Agent spawning is restricted to allowed types
- No direct file system or network access outside of tools

## Debugging

- Check the backend logs for execution errors
- Validate your JSON configuration against the schema
- Test your generator function logic incrementally
- Use the `think_deeply` tool for debugging complex logic

## Integration

Programmatic agents integrate seamlessly with the existing system:

- They can be spawned by other agents using `spawn_agents`
- They can spawn LLM-based agents as sub-agents
- They use the same tool execution infrastructure
- They follow the same security and validation rules
