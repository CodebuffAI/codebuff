import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'smart_find_files'
const endsAgentStep = false
export const smartFindFilesParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      query: z
        .string()
        .min(1, 'Query cannot be empty')
        .describe(
          'Specific description of what files you need. Examples: "authentication components and services", "test files for the payment system"'
        ),
      fileTypes: z
        .array(z.enum(['component', 'service', 'util', 'test', 'config', 'api', 'model', 'any']))
        .optional()
        .describe('Types of files to prioritize in search'),
      includeTests: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to include test files in results'),
      maxResults: z
        .number()
        .optional()
        .default(10)
        .describe('Maximum number of files to return (1-50)'),
    })
    .describe(
      'Enhanced file discovery tool that uses project context and patterns to efficiently locate files.',
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        files: z.array(z.object({
          path: z.string(),
          type: z.enum(['component', 'service', 'util', 'test', 'config', 'api', 'model', 'other']),
          relevanceScore: z.number(),
          reason: z.string(),
          lastModified: z.string(),
        })),
        searchStrategy: z.string(),
        totalFound: z.number(),
        searchTimeMs: z.number(),
        suggestions: z.array(z.string()),
        message: z.string(),
      }),
    }),
  ]),
} satisfies $ToolParams
