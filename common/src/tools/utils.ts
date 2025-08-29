import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from './constants'
import { $toolParams } from './list'

import type { ToolName } from './constants'
import type z from 'zod/v4'

export function getToolCallString<T extends ToolName | (string & {})>(
  toolName: T,
  params: T extends ToolName
    ? z.input<(typeof $toolParams)[T]['parameters']>
    : Record<string, any>,
  ...endsAgentStep: T extends ToolName ? [] : [boolean]
): string {
  const endsAgentStepValue =
    toolName in $toolParams
      ? $toolParams[toolName as keyof typeof $toolParams].endsAgentStep
      : endsAgentStep[0] ?? false
  const obj: Record<string, any> = {
    [toolNameParam]: toolName,
    ...params,
  }
  if (endsAgentStepValue) {
    obj[endsAgentStepParam] = endsAgentStepValue satisfies true
  }
  return [startToolTag, JSON.stringify(obj, null, 2), endToolTag].join('')
}
