import z from 'zod/v4'

import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'git_branch'
const endsAgentStep = true
const inputSchema = z
  .object({
    branch_name: z
      .string()
      .min(1)
      .describe(
        'Name of the branch to create. Must start with an alphanumeric character and contain only [a-zA-Z0-9._/-].',
      ),
    switch: z
      .boolean()
      .default(true)
      .optional()
      .describe(
        'When true (default), create AND switch to the branch (`git checkout -b`). When false, only create the branch (`git branch`), leaving the current branch checked out.',
      ),
    allow_dirty: z
      .boolean()
      .default(false)
      .optional()
      .describe(
        'When true, skip the dirty-tree refusal check. Defaults to false — the tool refuses to branch when the working tree has uncommitted changes.',
      ),
  })
  .describe(
    'Create a new git branch, optionally switching to it. Refuses to branch when the working tree is dirty unless `allow_dirty` is true.',
  )

const description = `
Create a new git branch in the current project, optionally switching to it. By default this refuses to branch when the working tree is dirty (uncommitted changes) — pass \`allow_dirty: true\` to override.

Use this when the user asks to "start a branch", "create a feature branch", or "commit on a new branch". Branch creation is a first-class agent operation that does NOT require \`run_terminal_command\`.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    branch_name: 'feat/my-feature',
  },
  endsAgentStep,
})}
`.trim()

export const gitBranchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        branch: z.string(),
        created: z.boolean(),
        switched: z.boolean(),
        previousBranch: z.string().optional(),
      }),
      z.object({
        errorMessage: z.string(),
      }),
    ]),
  ),
} satisfies $ToolParams
