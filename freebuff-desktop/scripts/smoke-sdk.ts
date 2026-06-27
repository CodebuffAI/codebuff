/**
 * De-risk SDK integration: run a tiny custom-tool agent on deepseek-v4-flash and
 * print the events. Usage:
 *   NEXT_PUBLIC_CODEBUFF_APP_URL=https://www.codebuff.com \
 *     bun freebuff-desktop/scripts/smoke-sdk.ts
 */

import { CodebuffClient, getCustomToolDefinition } from '@codebuff/sdk'
import { z } from 'zod/v4'

const created: unknown[] = []

const createTask = getCustomToolDefinition({
  toolName: 'create_task',
  description: 'Create a task in the orchestrator with a title and description.',
  inputSchema: z.object({
    title: z.string(),
    description: z.string(),
  }),
  endsAgentStep: true,
  exampleInputs: [{ title: 'Add dark mode', description: 'A theme toggle' }],
  execute: async (input) => {
    created.push(input)
    return [{ type: 'json', value: { taskId: `task-${created.length}` } }]
  },
})

const client = new CodebuffClient({
  apiKey: process.env.CODEBUFF_API_KEY,
  cwd: process.cwd(),
})

console.log('Backend:', process.env.NEXT_PUBLIC_CODEBUFF_APP_URL)

const result = await client.run({
  agent: {
    id: 'orchestrator-smoke',
    displayName: 'Orchestrator Smoke',
    model: 'deepseek/deepseek-v4-flash',
    toolNames: ['create_task'],
    instructionsPrompt:
      'You are a task orchestrator. When the user asks for work, call create_task ' +
      'once per distinct task. Do not write code yourself.',
  },
  prompt:
    'I want to add a dark mode toggle and also fix the broken login button. ' +
    'Create the tasks.',
  customToolDefinitions: [createTask],
  handleEvent: (event) => {
    if (event.type === 'tool_call') {
      console.log(`[tool_call] ${event.toolName}`, JSON.stringify(event.input))
    } else if (event.type === 'text') {
      process.stdout.write(event.text)
    } else if (event.type === 'error') {
      console.error(`\n[error] ${event.message}`)
    } else if (event.type === 'finish') {
      console.log('\n[finish]')
    }
  },
})

console.log('\n\n=== created tasks ===')
console.log(JSON.stringify(created, null, 2))
console.log('output:', result.output)
process.exit(0)
