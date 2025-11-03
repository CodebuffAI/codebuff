import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'read_subtree'
const endsAgentStep = true
export const readSubtreeParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      paths: z
        .array(z.string().min(1))
        .optional()
        .describe(
          `List of paths to directories or files. Relative to the project root. If omitted, the entire project tree is used.`,
        ),
      maxTokens: z
        .number()
        .int()
        .positive()
        .default(4000)
        .describe(
          `Maximum token budget for the subtree blob; the tree will be truncated to fit within this budget by first dropping file variables and then removing the most-nested files and directories.`,
        ),
    })
    .describe(
      `Read one or more directory subtrees (as a blob including subdirectories, file names, and parsed variables within each source file) or return parsed variable names for files. If no paths are provided, returns the entire project tree.`,
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.array(
        z.union([
          z.object({
            path: z.string(),
            type: z.literal('directory'),
            printedTree: z.string(),
            tokenCount: z.number(),
            truncationLevel: z.enum([
              'none',
              'unimportant-files',
              'tokens',
              'depth-based',
            ]),
          }),
          z.object({
            path: z.string(),
            type: z.literal('file'),
            variables: z.array(z.string()),
          }),
          z.object({
            path: z.string(),
            errorMessage: z.string(),
          }),
        ]),
      ),
    }),
  ]),
} satisfies $ToolParams
