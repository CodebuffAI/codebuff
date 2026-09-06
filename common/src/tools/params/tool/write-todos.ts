import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'write_todos'
const endsAgentStep = false
const inputSchema = z
  .object({
    todos: z
      .preprocess(
        coerceToArray,
        z.array(
          z.object({
            task: z.string().describe('Description of the task'),
            completed: z.boolean().describe('Whether the task is completed'),
          }),
        ),
      )
  .describe(
    'List of todos with their completion status.',
  ),
  })
  .describe(
    'Track multi-step work with a todo list.',
  )
const description = `
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    todos: [
      { task: 'Edit foo.ts', completed: true },
      { task: 'Run tests', completed: false },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const writeTodosParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        message: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
