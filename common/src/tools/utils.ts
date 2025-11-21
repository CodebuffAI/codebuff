import { toolParams } from './list'
import { $getToolCallString } from './params/utils'

import type { ToolName } from './constants'
import type z from 'zod/v4'

export function getToolCallString<T extends ToolName | (string & {})>(
  toolName: T,
  input: T extends ToolName
    ? z.input<(typeof toolParams)[T]['inputSchema']>
    : Record<string, any>,
  ...endsAgentStep: T extends ToolName ? [] : [boolean]
): string {
  const endsAgentStepValue =
    toolName in toolParams
      ? toolParams[toolName as keyof typeof toolParams].endsAgentStep
      : endsAgentStep[0] ?? false
  return $getToolCallString({
    toolName,
    inputSchema: null,
    input,
    endsAgentStep: endsAgentStepValue,
  })
}
