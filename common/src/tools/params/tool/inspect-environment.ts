import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import { jsonObjectSchema } from '../../../types/json'
import type { $ToolParams } from '../../constants'

export const inspectEnvironmentParams = {
  toolName: 'inspect_environment',
  endsAgentStep: true,
  description:
    'Read-only inspection of package manager, manifests, lockfiles, and available local toolchains. Does not install or execute project code.',
  inputSchema: z.object({}),
  outputSchema: jsonToolResultSchema(jsonObjectSchema),
} satisfies $ToolParams
