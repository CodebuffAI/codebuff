import z from 'zod/v4'

import { $getNativeToolCallExampleString, coerceToArray, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'read_slices'
const endsAgentStep = true
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe('File path to extract slices from, relative to the project root.'),
    symbols: z
      .preprocess(coerceToArray, z.array(z.string().min(1)))
      .describe('Symbol names (functions, classes, interfaces, methods) to extract code slices for.'),
  })
  .describe('Read only the specific implementation/code slices for specified symbol names in a file rather than the whole file.')

const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'sdk/src/provider-config.ts',
    symbols: ['resolveConfigFragmentPath', 'loadProviderConfigSync'],
  },
  endsAgentStep,
})}

Purpose: Retrieve exact targeted implementation slices for specified function or class names in a file. Maximizes speed and reduces token budget usage.
`.trim()

export const readSlicesParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.object({
      path: z.string(),
      slices: z.array(
        z.object({
          symbol: z.string(),
          content: z.string(),
          startLine: z.number(),
          endLine: z.number(),
        }),
      ),
    }),
  ),
} satisfies $ToolParams
