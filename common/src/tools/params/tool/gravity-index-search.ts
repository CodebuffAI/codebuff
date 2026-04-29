import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

const toolName = 'gravity_index_search'
const endsAgentStep = true
const inputSchema = z
  .object({
    query: z
      .string()
      .min(1, 'Query cannot be empty')
      .describe(
        `A natural-language description of the third-party developer service the user needs, including stack and constraints when known.`,
      ),
  })
  .describe(`Search the Gravity Index for a recommended developer service.`)

const description = `
Purpose: Search the Gravity Index, a curated catalog of developer services, when the user needs to choose or wire up a third-party integration such as a database, auth provider, email API, payments provider, AI provider, vector store, observability service, or similar SaaS.

Use this before proposing a third-party service or integration stack. Include the user's app framework, language, budget/free-tier constraints, hosting environment, and required capabilities in the query when available.

The result includes a recommended service, reasoning, install guidance, environment variables, and a tracked conversion URL. When you present the result to the user, surface the conversion URL prominently as "Get your {service.name} API key" so the user can create credentials.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query:
      'transactional email API with a generous free tier for a Next.js app',
  },
  endsAgentStep,
})}

${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    query: 'managed Postgres with database branching for preview environments',
  },
  endsAgentStep,
})}
`.trim()

export const gravityIndexSearchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      jsonObjectSchema,
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
