# @codebuff/sdk

Official SDK for Codebuff - AI coding agent and framework

## Installation

```bash
npm install @codebuff/sdk
```

## Prerequisites

- Create a Codebuff account and get your [Codebuff API key here](https://www.codebuff.com/profile?tab=api-keys).

## Usage

### Basic Example

```typescript
import { CodebuffClient } from '@codebuff/sdk'

async function main() {
  const client = new CodebuffClient({
    // Note: You need to pass in your own API key here. Get one: https://www.codebuff.com/profile?tab=api-keys
    apiKey: process.env.CODEBUFF_API_KEY,
    cwd: process.cwd(),
    onError: (e) => console.error('Codebuff error:', e.message),
  })

  // First run
  const run1 = await client.run({
    agent: 'base',
    prompt: 'Create a simple calculator class',
    handleEvent: (event) => {
      console.log(event) // Log all events
    },
  })

  // Continue the same session with a follow-up
  const run2 = await client.run({
    agent: 'base',
    prompt: 'Add unit tests for the calculator',
    previousRun: run1,
    handleEvent: (event) => {
      console.log(event) // Log all events
    },
  })

  client.closeConnection()
}

main()
```

### Example 2: Custom Agents and Tools

```typescript
import { z } from 'zod'
import {
  CodebuffClient,
  AgentDefinition,
  getCustomToolDefinition,
} from '@codebuff/sdk'

async function main() {
  const client = new CodebuffClient({
    // Note: You need to pass in your own API key. Get it here: https://www.codebuff.com/profile?tab=api-keys
    apiKey: process.env.CODEBUFF_API_KEY,
    cwd: process.cwd(),
    onError: (e) => console.error('Codebuff error:', e.message),
  })

  const myCustomAgent: AgentDefinition = {
    id: 'my-custom-agent',
    model: 'openai/gpt-5',
    displayName: 'Sentiment analyzer',
    instructionsPrompt: `
1. Describe the different sentiments in the given prompt.
2. Score the prompt along the following 5 dimensions:
  happiness, sadness, anger, fear, and surprise.`,
    // ... other AgentDefinition properties
  }

  const myCustomTool = getCustomToolDefinition({
    toolName: 'fetch_api_data',
    description: 'Fetch data from an API endpoint',
    inputSchema: z.object({
      url: z.url(),
      method: z.enum(['GET', 'POST']).default('GET'),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    outputSchema: z.array(
      z.object({
        type: z.literal('json'),
        value: z.object({
          message: z.string(),
        }),
      }),
    ),
    exampleInputs: [{ url: 'https://api.example.com/data', method: 'GET' }],
    handler: async ({ url, method, headers }) => {
      const response = await fetch(url, { method, headers })
      const data = await response.text()
      return [
        {
          type: 'json' as const,
          value: {
            message: `API Response: ${data.slice(0, 5000)}...`,
          },
        },
      ]
    },
  })

  const { output } = await client.run({
    agent: 'my-custom-agent',
    prompt: "Today I'm feeling very happy!",
    agentDefinitions: [myCustomAgent],
    customToolDefinitions: [myCustomTool],
    handleEvent: (event) => {
      console.log(event)
    },
  })

  console.log('Final output:', output)

  client.closeConnection()
}

main()
```

## API Reference

### `client.run(options)`

Runs a Codebuff agent with the specified options.

#### Parameters

- **`agent`** (string, required): The agent to run. Use `'base'` for the default agent, or specify a custom agent ID if you made your own agent definition (passed with the `agentDefinitions` param).

- **`prompt`** (string, required): The user prompt describing what you want the agent to do.

- **`params`** (object, optional): Additional parameters for the agent. Most agents don't use this, but some custom agents can take a JSON object as input in addition to the user prompt string.

- **`handleEvent`** (function, optional): Callback function that receives every event during execution (assistant messages, tool calls, etc.). This allows you to stream the agent's progress in real-time. We will likely add a token-by-token streaming callback in the future.

- **`previousRun`** (object, optional): JSON state returned from a previous `run()` call. Use this to continue a conversation or session with the agent, maintaining context from previous interactions.

- **`projectFiles`** (object, optional): All the files in your project as a plain JavaScript object. Keys should be the full path from your current directory to each file, and values should be the string contents of the file. Example: `{ "src/index.ts": "console.log('hi')" }`. This helps Codebuff pick good source files for context. Note: This parameter was previously named `allFiles` but has been renamed for clarity.

- **`knowledgeFiles`** (object, optional): Knowledge files to inject into every `run()` call. Uses the same schema as `projectFiles` - keys are file paths and values are file contents. These files are added directly to the agent's context.

- **`agentDefinitions`** (array, optional): Array of custom agent definitions. Each object should satisfy the AgentDefinition type.

- **`customToolDefinitions`** (array, optional): Array of custom tool definitions that extend the agent's capabilities. Each tool definition includes a name, Zod schema for input validation, and a handler function. These tools can be called by the agent during execution.

- **`maxAgentSteps`** (number, optional): Maximum number of steps the agent can take before stopping. Use this as a safety measure in case your agent starts going off the rails. A reasonable number is around 20.

#### Returns

Returns a Promise that resolves to a `RunState` object which can be passed into subsequent runs via the `previousRun` parameter to resume the conversation.

## License

MIT
