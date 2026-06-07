import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'apply_smart_patch'
const endsAgentStep = true
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe('File path to apply the smart patch to, relative to the project root.'),
    patch: z
      .string()
      .min(1, 'Patch cannot be empty')
      .describe('The unified diff patch hunk(s) containing the changes. Lines prefixed with - are deleted, lines with + are inserted, and lines with space are context.'),
    fuzzFactor: z
      .number()
      .int()
      .min(0)
      .default(3)
      .describe('Max lines of surrounding context displacement to allow when matching target patch region (Layer B).'),
    autoHeal: z
      .boolean()
      .default(true)
      .describe('If true, auto-heal minor syntax formatting or closing/bracket mismatches (Layer C).'),
    preflightCompile: z
      .boolean()
      .default(true)
      .describe('If true, run virtual preflight syntax/compile checks before writing changes to disk.'),
    allowPositionalFallback: z
      .boolean()
      .default(false)
      .describe('If true, apply a hunk at its line number when no unique fuzzy match is found. Defaults to false so smart patches fail closed instead of risking misplaced edits.'),
  })
  .describe('Apply a smart self-healing unified diff patch with fuzzy line alignment, AST-aware syntax auto-correction, and preflight compile validation.')

const description = `
Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'sdk/src/provider-config.ts',
    patch: '@@ -120,6 +120,7 @@\\n-  const lineEnding = "\\\\n"\\n+  const lineEnding = currentContent.includes("\\\\r\\\\n") ? "\\\\r\\\\n" : "\\\\n"\\n   const initialContentLineCount = 100\\n',
    fuzzFactor: 3,
    autoHeal: true,
    preflightCompile: true,
    allowPositionalFallback: false,
  },
  endsAgentStep,
})}

Purpose: Apply a highly robust, self-healing unified diff patch. Uses fuzzy alignment to locate shifted lines, AST structural checks to correct trailing commas/braces, and preflight compile checks to prevent saving invalid states.
`.trim()

export const applySmartPatchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.object({
      file: z.string(),
      applied: z.boolean(),
      alignedLine: z.number().optional(),
      offsetAdjusted: z.number().optional(),
      syntaxAutoHealed: z.boolean().optional(),
      preflightPassed: z.boolean().optional(),
      message: z.string(),
    }),
  ),
} satisfies $ToolParams
