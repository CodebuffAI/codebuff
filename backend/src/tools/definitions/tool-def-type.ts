import { ToolName } from '@codebuff/common/constants/tools'
import { z } from 'zod/v4'

export type CodebuffToolDef = {
  toolName: ToolName
  parameters: z.ZodObject<any>
  description: string
  endsAgentStep: boolean
}
