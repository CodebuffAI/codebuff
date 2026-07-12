import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import type { $ToolParams } from '../../constants'

export const getAffectedTestsParams = {
  toolName: 'get_affected_tests',
  endsAgentStep: true,
  description:
    'Maps changed source files to existing nearby test candidates and package roots without running tests.',
  inputSchema: z.object({ files: z.array(z.string().min(1)).min(1) }),
  outputSchema: jsonToolResultSchema(
    z.object({
      targets: z.array(
        z.object({
          source: z.string(),
          candidates: z.array(z.string()),
          packageRoot: z.string(),
        }),
      ),
    }),
  ),
} satisfies $ToolParams
