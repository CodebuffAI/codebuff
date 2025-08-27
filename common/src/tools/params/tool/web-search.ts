import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'web_search'
const endsAgentStep = true
export const webSearchParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(`The search query to find relevant web content`),
      depth: z
        .enum(['standard', 'deep'])
        .optional()
        .default('standard')
        .describe(
          `Search depth - 'standard' for quick results, 'deep' for more comprehensive search. Default is 'standard'.`,
        ),
    })
    .describe(`Search the web for current information using Linkup API.`),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.union([
        z.object({
          result: z.string(),
        }),
        z.object({
          errorMessage: z.string(),
        }),
      ]),
    }),
  ]),
} satisfies $ToolParams
