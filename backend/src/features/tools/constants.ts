import { ToolName } from '@codebuff/common/constants/tools'
import { z } from 'zod'

export interface CodebuffToolCall<T extends ToolName = ToolName> {
  type: 'tool-call'
  toolName: T
  toolCallId: string
  args: any
}

export type ClientToolCall<T extends ToolName = ToolName> = CodebuffToolCall<T>

export type CodebuffToolDef = {
  toolName: ToolName
  parameters: any // Using any to avoid Zod type issues
  description: string
  endsAgentStep: boolean
}

export type CodebuffToolHandlerFunction<T extends ToolName = ToolName> = (
  params: any
) => { result: Promise<string>; state: Record<string, any> }

export const codebuffToolDefs = {} as Record<ToolName, CodebuffToolDef>
