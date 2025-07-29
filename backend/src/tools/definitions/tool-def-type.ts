import type { ToolName } from '@codebuff/common/tools/constants'

export type ToolDescription<T extends ToolName = ToolName> = {
  toolName: T
  description: string
}
