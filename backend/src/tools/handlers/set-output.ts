import { AgentState } from '@codebuff/common/types/session-state'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'
import { getAllAgentTemplates } from '../../templates/agent-registry'
import { ProjectFileContext } from '@codebuff/common/util/file'

export const handleSetOutput = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_output'>
  fileContext: ProjectFileContext
  state: {
    agentState?: AgentState
  }
}): {
  result: Promise<string>
  state: { agentState: AgentState }
} => {
  const { previousToolCallFinished, toolCall, state, fileContext } = params
  const output = toolCall.args
  const { agentState } = state

  if (!agentState) {
    throw new Error(
      'Internal error for set_output: Missing agentState in state'
    )
  }

  const triggerSetOutput = async () => {
    const { agentRegistry } = await getAllAgentTemplates({
      fileContext,
    })
    // Validate output against outputSchema if defined
    const agentTemplate = agentState.agentType
      ? agentRegistry[agentState.agentType]
      : null
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
          'set_output validation error'
        )
        throw new Error(errorMessage)
      }
    }

    // Set the output (completely replaces previous output)
    agentState.output = output

    logger.debug(
      {
        output,
        agentType: agentState.agentType,
        agentId: agentState.agentId,
        updatedOutput: agentState.output,
      },
      'set_output tool call completed'
    )

    return 'Output set'
  }

  return {
    result: previousToolCallFinished.then(triggerSetOutput),
    state: { agentState: agentState },
  }
}) satisfies CodebuffToolHandlerFunction<'set_output'>
