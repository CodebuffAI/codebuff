import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

export const applyPatchResultSchema = z.union([
  z.object({
    message: z.string(),
    applied: z.array(
      z.object({
        file: z.string(),
        action: z.enum(['add', 'update', 'delete', 'move']),
      }),
    ),
  }),
  z.object({
    errorMessage: z.string(),
  }),
])

const toolName = 'apply_patch'
const endsAgentStep = false
const inputSchema = z
  .object({
    patch: z
      .string()
      .min(1, 'Patch cannot be empty')
      .describe('Patch text in Codex apply_patch format.'),
  })
  .describe('Apply a unified-diff style multi-file patch.')

const description = `
Use this tool to edit files using Codex-style patch format.

Patch format:
- Start with *** Begin Patch
- End with *** End Patch
- Use file ops: *** Add File, *** Update File, *** Delete File
- Use @@ hunks inside update operations

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    patch: `*** Begin Patch\n*** Add File: hello.txt\n+Hello world\n*** End Patch`,
  },
  endsAgentStep,
})}
`.trim()

export const applyPatchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(applyPatchResultSchema),
} satisfies $ToolParams
