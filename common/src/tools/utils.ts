import {
  endsAgentStepParam,
  endToolTag,
  startToolTag,
  toolNameParam,
} from './constants'
import { llmToolCallSchema } from './list'
import { closeXml } from '../util/xml'

import type { StringToolResultPart, ToolName } from './constants'
import type z from 'zod'

export function getToolCallString<T extends ToolName | (string & {})>(
  toolName: T,
  params: T extends ToolName
    ? z.input<(typeof llmToolCallSchema)[T]['parameters']>
    : Record<string, any>,
  ...endsAgentStep: T extends ToolName ? [] : [boolean]
): string {
  const endsAgentStepValue =
    toolName in llmToolCallSchema
      ? llmToolCallSchema[toolName as keyof typeof llmToolCallSchema]
          .endsAgentStep
      : endsAgentStep[0]
  const obj: Record<string, any> = {
    [toolNameParam]: toolName,
    ...params,
  }
  if (endsAgentStepValue) {
    obj[endsAgentStepParam] = endsAgentStepValue satisfies true
  }
  return [startToolTag, JSON.stringify(obj, null, 2), endToolTag].join('')
}

export function renderToolResults(toolResults: StringToolResultPart[]): string {
  if (toolResults.length === 0) {
    return ''
  }

  return `
${toolResults
  .map(
    (result) => `<tool_result>
<tool>${result.toolName}${closeXml('tool')}
<result>${result.output.value}${closeXml('result')}
${closeXml('tool_result')}`,
  )
  .join('\n\n')}
`.trim()
}
