import z from 'zod/v4'

import { $getNativeToolCallExampleString, textToolResultSchema } from '../utils'
import { taskMemoryDraftV1Schema } from '../../../types/task-memory'

import type { $ToolParams } from '../../constants'

const toolName = 'set_messages'
const endsAgentStep = true
const inputSchema = z
  .object({
    messages: z.any(),
    taskMemory: taskMemoryDraftV1Schema.optional(),
    expectedTaskMemoryRevision: z.number().int().min(-1).optional(),
  })
  .describe(
    `Atomically replace conversation history and, when supplied, commit a validated structured task-memory revision.`,
  )
const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    messages: [
      {
        role: 'user',
        content: 'Hello, how are you?',
      },
      {
        role: 'assistant',
        content: 'I am fine, thank you.',
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const setMessagesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: textToolResultSchema(),
} satisfies $ToolParams
