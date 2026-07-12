import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'get_change_review_bundle'
const endsAgentStep = true

export const getChangeReviewBundleParams = {
  toolName,
  endsAgentStep,
  description:
    'Builds a read-only, snapshot-scoped change-review bundle from the current Git worktree, including changed files, unified diff, ownership records when available, validation evidence, and reviewer findings. It never clears findings or mutates state.',
  inputSchema: z.object({
    max_chars: z.number().int().min(500).max(200_000).optional(),
  }),
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        snapshotId: z.string(),
        headCommit: z.string(),
        status: z.string(),
        files: z.array(z.string()),
        diff: z.string(),
        truncated: z.boolean(),
        ownership: z.array(z.record(z.string(), z.any())),
        validation: z.array(z.record(z.string(), z.any())),
        findings: z.array(z.record(z.string(), z.any())),
      }),
      z.object({ errorMessage: z.string() }),
    ]),
  ),
} satisfies $ToolParams
