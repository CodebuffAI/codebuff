import { getAgentTemplate } from '../../../templates/agent-registry'
import { logger } from '../../../util/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export const handleSetOutput = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_output'>
  fileContext: ProjectFileContext
  state: {
    agentState?: AgentState
    localAgentTemplates?: Record<string, AgentTemplate>
  }
}): {
  result: Promise<string>
  state: { agentState: AgentState }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const output = toolCall.input
  const { agentState, localAgentTemplates } = state

  if (!agentState) {
    throw new Error(
      'Internal error for set_output: Missing agentState in state',
    )
  }

  if (!localAgentTemplates) {
    throw new Error(
      'Internal error for set_output: Missing localAgentTemplates in state',
    )
  }

  const triggerSetOutput = async () => {
    // Validate output against outputSchema if defined
    let agentTemplate = null
    if (agentState.agentType) {
      agentTemplate = await getAgentTemplate(
        agentState.agentType,
        localAgentTemplates,
      )
    }
    if (agentTemplate?.outputSchema) {
      try {
        agentTemplate.outputSchema.parse(output)
      } catch (error) {
        const errorMessage = `Output validation failed for agent ${agentState.agentType}: ${error}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            error,
          },
          'set_output validation error',
        )
        throw new Error(errorMessage)
      }
    }

    // Set the output (completely replaces previous output)
    agentState.output = output

    return 'Output set'
  }

  return {
    result: previousToolCallFinished.then(triggerSetOutput),
    state: { agentState: agentState },
  }
}) satisfies CodebuffToolHandlerFunction<'set_output'>
