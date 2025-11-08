import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'write_todos'
const endsAgentStep = false
export const writeTodosParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      todos: z
        .array(
          z.object({
            task: z.string().describe('Description of the task'),
            completed: z.boolean().describe('Whether the task is completed'),
          }),
        )
        .describe(
          'List of todos with their completion status. Add ALL of the applicable tasks to the list, so you don\'t forget to do anything. Try to order the todos the same way you will complete them. Do not mark todos as completed if you have not completed them yet!',
        ),
    })
    .describe(
      'Write a todo list to track tasks for multi-step implementations. Use this frequently to maintain an updated step-by-step plan.',
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        todos: z.array(z.object({ task: z.string(), completed: z.boolean() })),
      }),
    }),
  ]),
} satisfies $ToolParams
