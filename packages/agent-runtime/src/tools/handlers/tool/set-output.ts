import { getAgentTemplate } from '../../../templates/agent-registry'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

type ToolName = 'set_output'
export const handleSetOutput: CodebuffToolHandlerFunction<ToolName> = (
  params,
) => {
  const { previousToolCallFinished, toolCall, state, logger } = params
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
      agentTemplate = await getAgentTemplate({
        ...params,
        agentId: agentState.agentType,
        localAgentTemplates,
      })
    }
    if (agentTemplate?.outputSchema) {
      try {
        agentTemplate.outputSchema.parse(output)
      } catch (error) {
        const errorMessage = `Output validation error: Output failed to match the output schema and was ignored. You might want to try again! Issues: ${error}`
        logger.error(
          {
            output,
            agentType: agentState.agentType,
            agentId: agentState.agentId,
            error,
          },
          'set_output validation error',
        )
        return errorMessage
      }
    }

    // Set the output (completely replaces previous output)
    agentState.output = output

    return 'Output set'
  }

  return {
    result: (async () => {
      await previousToolCallFinished
      return [
        {
          type: 'json',
          value: {
            message: await triggerSetOutput(),
          },
        },
      ]
    })(),
    state: { agentState: agentState },
  }
}
