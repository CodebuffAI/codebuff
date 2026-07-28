import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'cloud_plan_ready'
const endsAgentStep = true

const inputSchema = z.object({
  summary: z
    .string()
    .min(1)
    .describe(
      'One short user-facing sentence describing the agreed product. Put implementation detail in build_prompt.',
    ),
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
  required_integrations: z
    .array(
      z.object({
        search_id: z
          .string()
          .trim()
          .min(1)
          .describe(
            'The exact search_id from the Gravity search that recommended this service.',
          ),
        slug: z
          .string()
          .trim()
          .min(1)
          .describe('The exact Gravity recommendation slug.'),
      }),
    )
    // Defaulted rather than required: a planner that cannot cite a search_id
    // must still be able to finalize. An incomplete credential list only costs
    // the user a manual env var later, while a blocked call costs them the
    // Start building button entirely.
    .default([])
    .describe(
      'Every selected Gravity service whose recommendation returned required API keys or environment variables. Pass [] when the plan needs no credential-bearing external service, or when you have no exact search_id to cite.',
    ),
})

const outputSchema = z.object({ message: z.string() })

const description = `
Mark a blank Freebuff Cloud project plan as ready for the user to approve.

Call this once you know what the product does and which technologies it uses:
- You understand the product, its users, and its core flows.
- You chose every technology in the stack with gravity_index.
- You presented the stack and answered the user's questions about it.

This does not start implementation. It makes a "Start building" button appear
for the user, and that button is how the user approves the plan — do not ask
them to confirm the plan before calling this, and never end a turn saying you
are ready to finalize instead of calling it.

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    summary: 'A collaborative booking app for independent music teachers.',
    stack: ['React', 'Vite', 'Supabase', 'Resend'],
    build_prompt:
      'Build the agreed booking app with teacher availability, student booking, authentication, and transactional email.',
    required_integrations: [
      {
        search_id: 'search_id_from_gravity_index',
        slug: 'resend',
      },
    ],
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
