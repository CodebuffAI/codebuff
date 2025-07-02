import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

export const readFilesTool = {
  toolName: 'read_files',
  endsAgentStep: true,
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
${getToolCallString('read_files', {
  paths: ['path/to/file1.ts', 'path/to/file2.ts'],
})}
    `.trim(),
} satisfies CodebuffToolDef
