import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'read_docs'
const endsAgentStep = true
export const readDocsParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      libraryTitle: z
        .string()
        .min(1, 'Library title cannot be empty')
        .describe(
          `The library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation if possible. Only public libraries available in Context7's database are supported, so small or private libraries may not be available.`,
        ),
      topic: z
        .string()
        .describe(
          `Specific topic to focus on (e.g., "routing", "hooks", "authentication")`,
        ),
      max_tokens: z
        .number()
        .default(20_000)
        .optional()
        .describe(
          `Optional maximum number of tokens to return. Defaults to 20000. Values less than 10000 are automatically increased to 10000.`,
        ),
    })
    .describe(
      `Fetch up-to-date documentation for libraries and frameworks using Context7 API.`,
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        documentation: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
