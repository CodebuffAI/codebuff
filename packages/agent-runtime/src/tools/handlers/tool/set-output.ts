import { jsonToolResult } from '@codebuff/common/util/messages'
import {
  decodeJsonObjectString,
  normalizeStructuredOutputValue,
} from '@codebuff/common/tools/params/tool/set-output'

import { getAgentTemplate } from '../../../templates/agent-registry'
import { formatValueForError } from '../../../util/format-value'

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
  await previousToolCallFinished

  const rawOutput = toolCall.input as Record<string, unknown>
  const decodedData = decodeJsonObjectString(rawOutput?.data)
  if (typeof rawOutput?.data === 'string' && decodedData === rawOutput.data) {
    return {
      output: jsonToolResult({
        message:
          'Output was not set because data contained malformed or incomplete JSON text. Retry set_output with a real object value, not JSON.stringify(...). Keep findings and evidence concise enough to complete one tool call.',
      }),
    }
  }
  const decodedOutput =
    decodedData === rawOutput?.data
      ? rawOutput
      : { ...rawOutput, data: decodedData }
  const decodedDataRecord =
    decodedOutput.data &&
    typeof decodedOutput.data === 'object' &&
    !Array.isArray(decodedOutput.data)
      ? (decodedOutput.data as Record<string, unknown>)
      : undefined
  const shouldNormalizeReviewerOutput =
    agentState.agentType?.toLowerCase().includes('reviewer') === true ||
    decodedOutput.family === 'reviewer' ||
    decodedDataRecord?.family === 'reviewer'

  let agentTemplate = null
  if (agentState.agentType) {
    agentTemplate = await getAgentTemplate({
      ...params,
      agentId: agentState.agentType,
    })
  }

  let finalOutput: unknown
  if (agentTemplate?.outputSchema) {
    const candidates: Array<{
      source: 'output' | 'normalized-output' | 'data' | 'normalized-data'
      value: unknown
    }> = [{ source: 'output', value: decodedOutput }]
    if (shouldNormalizeReviewerOutput) {
      candidates.push({
        source: 'normalized-output',
        value: normalizeStructuredOutputValue(decodedOutput),
      })
    }
    if (decodedDataRecord) {
      candidates.push({ source: 'data', value: decodedDataRecord })
      if (shouldNormalizeReviewerOutput) {
        candidates.push({
          source: 'normalized-data',
          value: normalizeStructuredOutputValue(decodedDataRecord),
        })
      }
    }
    const failures: Array<{
      source: (typeof candidates)[number]['source']
      error: unknown
    }> = []
    for (const candidate of candidates) {
      try {
        finalOutput = agentTemplate.outputSchema.parse(candidate.value)
        failures.length = 0
        break
      } catch (error) {
        failures.push({ source: candidate.source, error })
      }
    }
    if (failures.length > 0) {
      const bestFailure = failures.reduce((best, failure) =>
        getZodIssueCount(failure.error) < getZodIssueCount(best.error)
          ? failure
          : best,
      )
      const usedData = bestFailure.source.endsWith('data')
      const prefix = usedData
        ? 'Output validation error: Your output was found inside the `data` field but still failed validation. Please fix the reported fields and retry with native object/array values. Issues: '
        : 'Output validation error: Output failed to match the output schema and was ignored. Please fix the reported fields and retry with native object/array values. Issues: '
      const errorMessage = `${prefix}${bestFailure.error}\n\nOriginal output value:\n${formatValueForError(decodedOutput)}`
      logger.error(
        {
          outputShape: {
            keys: Object.keys(decodedOutput),
            dataType: Array.isArray(decodedOutput.data)
              ? 'array'
              : typeof decodedOutput.data,
          },
          agentType: agentState.agentType,
          agentId: agentState.agentId,
          validationFailures: failures,
          selectedFailureSource: bestFailure.source,
        },
        'set_output validation error',
      )
      return { output: jsonToolResult({ message: errorMessage }) }
    }
  } else {
    // When no outputSchema, use the data field if it is the only field
    // otherwise use the entire output object
    const keys = Object.keys(decodedOutput)
    const hasOnlyDataField = keys.length === 1 && keys[0] === 'data'
    finalOutput = hasOnlyDataField ? decodedOutput.data : decodedOutput
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
