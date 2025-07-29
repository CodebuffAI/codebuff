import type { ToolParams } from '../../constants'

import z from 'zod/v4'

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
          `The exact library or framework name (e.g., "Next.js", "MongoDB", "React"). Use the official name as it appears in documentation, not a search query.`
        ),
      topic: z
        .string()
        .optional()
        .describe(
          `Optional specific topic to focus on (e.g., "routing", "hooks", "authentication")`
        ),
      max_tokens: z
        .number()
        .optional()
        .describe(
          `Optional maximum number of tokens to return. Defaults to 10000. Values less than 10000 are automatically increased to 10000.`
        ),
    })
    .describe(
      `Fetch up-to-date documentation for libraries and frameworks using Context7 API.`
    ),
} satisfies ToolParams
