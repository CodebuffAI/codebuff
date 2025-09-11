import z from 'zod/v4'

import type { $ToolResults } from '../../../tools/constants'

const toolName = 'file_updates'
export const fileUpdatesResultSchema = {
  toolName: toolName,
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.object({
        message: z.string().optional(),
        files: z.array(
          z.object({
            path: z.string(),
            content: z.string(),
            referencedBy: z.record(z.string(), z.string().array()).optional(),
          }),
        ),
      }),
    }),
  ]),
} as const satisfies $ToolResults
