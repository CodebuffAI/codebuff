import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'git_status'
const endsAgentStep = true
const inputSchema = z
  .object({
    include_diff: z
      .boolean()
      .default(false)
      .optional()
      .describe('When true, also return the unified diff of uncommitted changes.'),
    staged: z
      .boolean()
      .default(false)
      .optional()
      .describe('When true with include_diff, returns the staged diff instead of unstaged.'),
    path: z
      .string()
      .optional()
      .describe('Optional path to scope status/diff to (relative to project root).'),
    max_chars: z
      .number()
      .int()
      .min(500)
      .max(200_000)
      .default(40_000)
      .optional()
      .describe('Maximum characters of diff output to return. Defaults to 40,000.'),
  })
  .describe('Read-only git status and (optionally) diff for the current project.')

const description = `
Read-only \`git status --short\` (and optionally \`git diff\`) for the current project. Use this when you need a quick "what changed" view without shelling out via run_terminal_command.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    include_diff: true,
  },
  endsAgentStep,
})}
`.trim()

export const gitStatusParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        branch: z.string().optional(),
        status: z.string(),
        diff: z.string().optional(),
        truncated: z.boolean().optional(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
