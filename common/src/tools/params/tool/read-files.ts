import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

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
      .preprocess(
        coerceToArray,
        z.array(
          z
            .string()
            .min(1, 'Paths cannot be empty')
            .describe(
              `File path to read. Prefer paths relative to the **project root**; absolute paths inside the project are accepted, but paths outside the project will not work.`,
            ),
        ),
      )
      .describe('List of file paths to read.'),
  })
  .describe(
    `Read multiple files from disk. Returned file content shares a 20,000 estimated-token limit and a 100,000-character hard limit. Prefer the smallest relevant set of files and use code_search for targeted discovery.`,
  )
const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    paths: ['path/to/file1.ts', 'path/to/file2.ts'],
  },
  endsAgentStep,
})}
`.trim()
export const readFilesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(fileContentsSchema.array()),
} satisfies $ToolParams
