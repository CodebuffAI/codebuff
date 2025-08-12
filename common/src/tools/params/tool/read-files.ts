import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'read_files'
const endsAgentStep = true
export const readFilesParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      paths: z
        .array(
          z
            .string()
            .min(1, 'Paths cannot be empty')
            .describe(
              `File path to read relative to the **project root**. Absolute file paths will not work.`,
            ),
        )
        .describe('List of file paths to read.'),
    })
    .describe(
      `Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.`,
    ),
} satisfies ToolParams
