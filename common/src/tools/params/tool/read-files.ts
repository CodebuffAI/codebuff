import z from 'zod/v4'

import { validateToolParams } from '../../constants'
import { $getToolCallString, jsonToolResultSchema } from '../utils'

export const fileContentsSchema = z.union([
  z.object({
    path: z.string(),
    content: z.string(),
    referencedBy: z.record(z.string(), z.string().array()).optional(),
  }),
  z.object({
    path: z.string(),
    contentOmittedForLength: z.literal(true),
  }),
])

const toolName = 'read_files'
const endsAgentStep = true
const inputSchema = z
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
  )
const description = `
Note: DO NOT call this tool for files you've already read! There's no need to read them again — any changes to the files will be surfaced to you as a file update tool result.

Example:
${$getToolCallString({
  toolName,
  inputSchema,
  input: {
    paths: ['path/to/file1.ts', 'path/to/file2.ts'],
  },
  endsAgentStep,
})}
`.trim()

export const readFilesParams = validateToolParams({
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(fileContentsSchema.array()),
})
