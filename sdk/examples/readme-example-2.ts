import { z } from 'zod/v4'

import { CodebuffClient, getCustomToolDefinition } from '@codebuff/sdk'

import type { AgentDefinition } from '@codebuff/sdk'

async function main() {
  const client = new CodebuffClient({
    // Note: You need to pass in your own API key.
    // Get it here: https://www.codebuff.com/profile?tab=api-keys
    apiKey: process.env.CODEBUFF_API_KEY,
    // Optional directory agent runs from (if applicable).
    cwd: process.cwd(),
  })

  // Define your own custom agents!
  const myCustomAgent: AgentDefinition = {
    id: 'my-custom-agent',
    model: 'x-ai/grok-4-fast',
    displayName: 'Sentiment analyzer',
    toolNames: ['fetch_api_data'], // Defined below!
    instructionsPrompt: `
1. Describe the different sentiments in the given prompt.
2. Score the prompt along the following 5 dimensions:
  happiness, sadness, anger, fear, and surprise.`,
    // ... other AgentDefinition properties
  }

  // And define your own custom tools!
  const myCustomTool = getCustomToolDefinition({
    toolName: 'fetch_api_data',
    description: 'Fetch data from an API endpoint',
    inputSchema: z.object({
      url: z.url(),
      method: z.enum(['GET', 'POST']).default('GET'),
      headers: z.record(z.string(), z.string()).optional(),
    }),
    exampleInputs: [{ url: 'https://api.example.com/data', method: 'GET' }],
    execute: async ({ url, method, headers }) => {
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
    // Run a custom agent by id. Must match an id in the agentDefinitions field below.
    agent: 'my-custom-agent',
    prompt: "Today I'm feeling very happy!",

    // Provide custom agent and tool definitions:
    agentDefinitions: [myCustomAgent],
    customToolDefinitions: [myCustomTool],

    handleEvent: (event) => {
      // All events that happen during the run: agent start/finish, tool calls/results, text responses, errors.
      console.log('Codebuff Event', JSON.stringify(event))
    },
  })

  if (output.type === 'error') {
    console.error(`The run failed:\n${output.message}`)
  } else {
    console.log('The run succeeded with output:', output)
  }
}

main()
