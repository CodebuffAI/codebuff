import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'suggest_followups'
const endsAgentStep = false

const followupSchema = z.object({
  prompt: z
    .string()
    .describe(
      'The prompt text to send as a user message when clicked. Keep it short and goal-oriented — one sentence naming the outcome, not the steps to get there',
    ),
  label: z
    .string()
    .optional()
    .describe(
      'Short display label for the card (defaults to truncated prompt if not provided)',
    ),
})

export type SuggestFollowup = z.infer<typeof followupSchema>

const inputSchema = z
  .object({
    followups: z
      .preprocess(
        coerceToArray,
        z
          .array(followupSchema)
          .min(1, 'Must provide at least one followup'),
      )
      .describe(
        'List of suggested followup prompts the user can click to send',
      ),
  })
  .describe(
    `Suggest clickable followup prompts to the user. Each followup becomes a card the user can click to send that prompt.`,
  )

const outputSchema = z.object({
  message: z.string(),
})

const description = `
Suggest clickable followup prompts. Each followup becomes a card the user can click to send that prompt.

Aim for ~3 suggestions. Keep each short and goal-oriented — name the outcome, not the steps. Skip work the user would have to do themselves.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    followups: [
      { prompt: 'Add unit tests for this change', label: 'Add tests' },
      { prompt: 'Continue with the next step', label: 'Continue' },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const suggestFollowupsParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(outputSchema),
} satisfies $ToolParams
