import { AgentState } from '@codebuff/common/types/session-state'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleUpdateReport = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'update_report'>
  state: {
    agentState?: AgentState
  }
}): {
  result: Promise<string>
  state: { agentState: AgentState }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const { json_update: jsonUpdate } = toolCall.args
  const { agentState } = state

  if (!agentState) {
    throw new Error(
      'Internal error for update_report: Missing agentState in state'
    )
  }

  const triggerUpdateReport = async () => {
    agentState.report = {
      ...agentState.report,
      ...jsonUpdate,
    }

    logger.debug(
      {
        jsonUpdate,
        agentType: agentState.agentType,
        agentId: agentState.agentId,
      },
      'update_report tool call'
    )

    return 'Report updated'
  }

  return {
    result: previousToolCallFinished.then(triggerUpdateReport),
    state: { agentState },
  }
}) satisfies CodebuffToolHandlerFunction<'update_report'>
