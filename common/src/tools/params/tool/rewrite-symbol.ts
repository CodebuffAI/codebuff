import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
} from '../utils'
import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const toolName = 'rewrite_symbol'
const endsAgentStep = false
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe(
        'File path containing the symbol, relative to the project root.',
      ),
    symbol: z
      .string()
      .min(1)
      .describe(
        'Name of the function/class/method/type/interface to replace (as shown by read_outline).',
      ),
    content: z
      .string()
      .refine((value) => !isObviousEditPlaceholder(value), {
        message:
          'content is an explicit placeholder. Provide the complete replacement source for the symbol.',
      })
      .describe(
        'The complete new source for the symbol, replacing its entire current definition (e.g. the whole function including its signature and body). Provide REAL newlines/tabs in the string — literal backslash-n (\\n) and backslash-t (\\t) sequences are not interpreted and will be written verbatim into the file. This matches str_replace.',
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
    content: `function resolveConfigFragmentPath(configPath: string, fragmentPath: string): string {
  return path.resolve(path.dirname(configPath), fragmentPath)
}`,
  },
  endsAgentStep,
})}

Purpose: Structural, drift-proof edits. Instead of copying a symbol's current text into str_replace's oldString (which breaks if the file changed), name the symbol and provide its full replacement; the runtime finds its exact range from the AST. Best supported for TypeScript/JavaScript source files where read_outline shows concrete symbols. For JSON, Markdown, plain text, or files/languages where no syntax-tree symbol is available, the tool returns guidance to use read_files + str_replace/replace_range instead.

IMPORTANT: \`content\` is written verbatim — pass actual newlines and tabs, not backslash escape sequences. \`"foo\\nbar"\` writes the literal characters \`foo\\nbar\` into the file, not two lines.
The content must be self-contained; references such as "[see code above]" are rejected.
`.trim()

export const rewriteSymbolParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
