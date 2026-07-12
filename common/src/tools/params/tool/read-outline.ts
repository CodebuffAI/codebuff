import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'read_outline'
const endsAgentStep = true
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe(
        'File path to generate the AST-like outline for, relative to the project root.',
      ),
  })
  .describe(
    'Generate an outline of imports, exports, classes, methods, and function signatures in a source file without reading the entire implementation.',
  )

const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'sdk/src/provider-config.ts',
  },
  endsAgentStep,
})}

Purpose: Return a concise structural outline of a file. Shows imports, exports, interfaces, classes, methods, and functions with their signatures. Perfect for understanding large files without using massive token counts.
`.trim()

export const readOutlineParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.object({
      path: z.string(),
      outline: z.string(),
      errorMessage: z.string().optional(),
    }),
  ),
} satisfies $ToolParams
