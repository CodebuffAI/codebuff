import { jsonToolResult } from '@codebuff/common/util/messages'

import { getAgentTemplate } from '../../../templates/agent-registry'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type {
  AgentTemplate,
  Logger,
} from '@codebuff/common/types/agent-template'
import type { FetchAgentFromDatabaseFn } from '@codebuff/common/types/contracts/database'
import type { AgentState } from '@codebuff/common/types/session-state'

type ToolName = 'set_output'
export const handleSetOutput = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>

  agentState: AgentState
  apiKey: string
  databaseAgentCache: Map<string, AgentTemplate | null>
  localAgentTemplates: Record<string, AgentTemplate>
  logger: Logger
  fetchAgentFromDatabase: FetchAgentFromDatabaseFn
}): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, agentState, logger } = params
  const output = toolCall.input
  const { data } = output ?? {}

  await previousToolCallFinished

  let agentTemplate = null
  if (agentState.agentType) {
    agentTemplate = await getAgentTemplate({
      ...params,
      agentId: agentState.agentType,
    })
  }

  let finalOutput: unknown
  if (agentTemplate?.outputSchema) {
    // When outputSchema is defined, validate against it
    try {
      agentTemplate.outputSchema.parse(output)
      finalOutput = output
    } catch (error) {
      try {
        // Fallback to the 'data' field if the whole output object is not valid
        agentTemplate.outputSchema.parse(data)
        finalOutput = data
      } catch (error2) {
        // Show whichever error has fewer issues — that represents the "closer" parse
        // attempt and gives the agent more actionable feedback for retrying.
        const issues1 = getZodIssueCount(error)
        const issues2 = getZodIssueCount(error2)
        const usedData = issues2 < issues1
        const bestError = usedData ? error2 : error
        const prefix = usedData
          ? 'Output validation error: Your output was found inside the `data` field but still failed validation. Please fix the issues and try again without wrapping in `data`. Issues: '
          : 'Output validation error: Output failed to match the output schema and was ignored. You might want to try again! Issues: '
        const outputStr = JSON.stringify(output, null, 2)
        const truncatedOutput = outputStr.length > 500
          ? outputStr.slice(0, 500) + '...(truncated)'
          : outputStr
        const errorMessage = `${prefix}${bestError}\n\nOriginal output value:\n${truncatedOutput}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            topLevelError: error,
            dataFieldError: error2,
            usedDataFieldError: usedData,
          },
          'set_output validation error',
        )
        return { output: jsonToolResult({ message: errorMessage }) }
      }
    }
  } else {
    // When no outputSchema, use the data field if it is the only field
    // otherwise use the entire output object
    const keys = Object.keys(output)
    const hasOnlyDataField = keys.length === 1 && keys[0] === 'data'
    finalOutput = hasOnlyDataField ? data : output
  }

  // Set the output (completely replaces previous output)
  agentState.output = finalOutput as Record<string, unknown>

  return { output: jsonToolResult({ message: 'Output set' }) }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function getZodIssueCount(error: unknown): number {
  if (
    error != null &&
    typeof error === 'object' &&
    'issues' in error &&
    Array.isArray((error as { issues: unknown }).issues)
  ) {
    return (error as { issues: unknown[] }).issues.length
  }
  return Infinity
}
