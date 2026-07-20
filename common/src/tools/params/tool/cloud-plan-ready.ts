import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'cloud_plan_ready'
const endsAgentStep = true

const inputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe('A concise user-facing summary of the agreed product plan.'),
  stack: z
    .array(z.string().min(1))
    .min(1)
    .describe('The agreed frameworks, services, and infrastructure choices.'),
  build_prompt: z
    .string()
    .min(1)
    .describe(
      'A complete implementation brief for the coding agent that will build the project.',
    ),
})

const outputSchema = z.object({ message: z.string() })

const description = `
Mark a blank Freebuff Cloud project plan as ready for the user to approve.

Call this only after:
- You understand the product, users, core flows, and important constraints.
- You have used gravity_index for every third-party service recommendation.
- You have explained the proposed stack and answered the user's questions.

This does not start implementation. It makes a "Start building" button appear
for the user. Do not call it while important requirements are unresolved.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    summary: 'A collaborative booking app for independent music teachers.',
    stack: ['React', 'Vite', 'Supabase', 'Resend'],
    build_prompt:
      'Build the agreed booking app with teacher availability, student booking, authentication, and transactional email.',
  },
  endsAgentStep,
})}
`.trim()

export const cloudPlanReadyParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(outputSchema),
} satisfies $ToolParams
