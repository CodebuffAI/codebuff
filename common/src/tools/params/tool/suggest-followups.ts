import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'suggest_followups'
const endsAgentStep = false

const followupSchema = z.object({
  prompt: z
    .string()
    .describe('The full prompt text to send as a user message when clicked'),
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
      .array(followupSchema)
      .min(1, 'Must provide at least one followup')
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
Suggest clickable followup prompts to the user. When the user clicks a suggestion, it sends that prompt as a new user message.

Use this tool after completing a task to suggest what the user might want to do next. Good suggestions include:
- Alternatives to the latest implementation like "Cache the data to local storage instead"
- Related features like "Add a hover card to show the data from the state"
- Cleanup opportunities like "Refactor app.ts into multiple files"
- Testing suggestions like "Add unit tests for this change"
- "Continue with the next step" - when there are more steps in a plan

Don't include suggestions like:
- "Commit these changes"
- "Test x" without saying how you would test the changes (unit test, script, or something else?). Remember, this is a prompt for the assistant to do. Don't suggest manual testing that the user would have to do.

Try to make different suggestions than you did in past steps. That's because users can still click previous suggestions if they want to.

Aim for around 3 suggestions. The suggestions persist and remain clickable, with clicked ones visually updated to show they were used.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    followups: [
      {
        prompt: 'Continue with the next step',
        label: 'Continue',
      },
      {
        prompt: 'Add unit tests for the new UserService class',
        label: 'Add tests',
      },
      {
        prompt: 'Refactor the authentication logic into a separate module',
        label: 'Refactor auth',
      },
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
