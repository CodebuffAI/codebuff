import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'
import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const toolName = 'rewrite_symbol'
const endsAgentStep = false
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe('File path containing the symbol, relative to the project root.'),
    symbol: z
      .string()
      .min(1)
      .describe(
        'Name of the function/class/method/type/interface to replace (as shown by read_outline).',
      ),
    content: z
      .string()
      .describe(
        "The complete new source for the symbol, replacing its entire current definition (e.g. the whole function including its signature and body).",
      ),
    occurrence: z
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'When multiple top-level symbols share this name, the 1-indexed one to replace.',
      ),
  })
  .describe(
    "Replace a whole symbol's definition by name using the file's syntax tree, without copying its current text. Resolves the exact AST range and applies it through the safe str_replace path (atomic, anchored).",
  )

const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'sdk/src/provider-config.ts',
    symbol: 'resolveConfigFragmentPath',
    content:
      'function resolveConfigFragmentPath(configPath: string, fragmentPath: string): string {\n  return path.resolve(path.dirname(configPath), fragmentPath)\n}',
  },
  endsAgentStep,
})}

Purpose: Structural, drift-proof edits. Instead of copying a symbol's current text into str_replace's oldString (which breaks if the file changed), name the symbol and provide its full replacement; the runtime finds its exact range from the AST. Falls back with guidance for languages/files it can't parse — use str_replace there.
`.trim()

export const rewriteSymbolParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
