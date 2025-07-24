import type { CodebuffToolDef } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'

const toolName = 'read_files'
const endsAgentStep = true
export const readFilesTool = {
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
              `File path to read relative to the **project root**. Absolute file paths will not work.`
            )
        )
        .describe('List of file paths to read.'),
    })
    .describe(
      `Read the multiple files from disk and return their contents. Use this tool to read as many files as would be helpful to answer the user's request.`
    ),
  description: `
Note: DO NOT call this tool for files you've already read! There's no need to read them again — any changes to the files will be surfaced to you as a file update tool result.

Example:
${getToolCallString(
  toolName,
  {
    paths: ['path/to/file1.ts', 'path/to/file2.ts'],
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
