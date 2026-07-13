import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'inspect_workspace'
const endsAgentStep = true
const inputSchema = z
  .object({})
  .describe(
    'Inspect the current repository/worktree identity and Git state without modifying it.',
  )

export const inspectWorkspaceParams = {
  toolName,
  endsAgentStep,
  description:
    'Returns the canonical repository root, current worktree, Git common directory, branch, upstream/default branch, HEAD, and dirty status. Use this before workspace-sensitive planning, validation, integration, commit, or release decisions.',
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        repositoryId: z.string(),
        workspaceId: z.string(),
        canonicalRoot: z.string(),
        repositoryRoot: z.string(),
        workingDirectory: z.string(),
        gitCommonDir: z.string(),
        isLinkedWorktree: z.boolean(),
        branch: z.string().optional(),
        upstream: z.string().optional(),
        defaultBranch: z.string().optional(),
        headCommit: z.string(),
        dirty: z.boolean(),
        status: z.string(),
      }),
      z.object({ errorMessage: z.string() }),
    ]),
  ),
} satisfies $ToolParams
