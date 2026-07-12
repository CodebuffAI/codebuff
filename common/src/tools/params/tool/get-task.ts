import z from 'zod/v4'

import { jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'

import type { $ToolParams } from '../../constants'

const toolName = 'get_task'
const endsAgentStep = true

export const getTaskParams = {
  toolName,
  endsAgentStep,
  description:
    'Reads the active or named durable plan task state, including execution phase, revision, checkpoint, task dependencies, readiness, and artifact paths. This is read-only and cannot update task status.',
  inputSchema: z.object({
    session: z
      .string()
      .optional()
      .describe('Optional plan session slug. Defaults to .agents/ACTIVE_SESSION.'),
  }),
  outputSchema: jsonToolResultSchema(
    z.union([
      z.object({
        session: z.string(),
        sessionDir: z.string(),
        state: jsonObjectSchema.nullable(),
        preflight: jsonObjectSchema.nullable(),
        artifacts: z.array(z.string()),
      }),
      z.object({ errorMessage: z.string() }),
    ]),
  ),
} satisfies $ToolParams
