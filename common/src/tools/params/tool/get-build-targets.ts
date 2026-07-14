import z from 'zod/v4'
import { jsonToolResultSchema } from '../utils'
import type { $ToolParams } from '../../constants'

export const getBuildTargetsParams = {
  toolName: 'get_build_targets',
  endsAgentStep: true,
  description:
    'Returns affected package manifests and available typecheck/test/lint/build scripts for changed files without executing them.',
  inputSchema: z.object({ files: z.array(z.string().min(1)).min(1) }),
  outputSchema: jsonToolResultSchema(
    z.object({
      targets: z.array(
        z.object({
          packageRoot: z.string(),
          scripts: z.array(z.string()),
          manifest: z.string(),
          manager: z.string().optional(),
          commands: z.array(z.string()).optional(),
          confidence: z
            .enum(['confirmed', 'inferred', 'unknown'])
            .optional(),
        }),
      ),
    }),
  ),
} satisfies $ToolParams
