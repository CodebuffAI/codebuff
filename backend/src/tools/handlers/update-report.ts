import { AgentState } from '@codebuff/common/types/session-state'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleUpdateReport = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'update_report'>
  state: {
    mutableState?: { agentState: AgentState }
  }
}): {
  result: Promise<string>
  state: { mutableState: { agentState: AgentState } }
} => {
  const { previousToolCallFinished, toolCall, state } = params
  const { json_update: jsonUpdate } = toolCall.args
  const { mutableState } = state

  if (!mutableState?.agentState) {
    throw new Error(
      'Internal error for update_report: Missing agentState in state'
    )
  }

  const triggerUpdateReport = async () => {
    mutableState.agentState.report = {
      ...mutableState.agentState.report,
      ...jsonUpdate,
    }

    logger.debug(
      {
        jsonUpdate,
        agentType: mutableState.agentState.agentType,
        agentId: mutableState.agentState.agentId,
      },
      'update_report tool call'
    )

    return 'Report updated'
  }

  return {
    result: previousToolCallFinished.then(triggerUpdateReport),
    state: { mutableState },
  }
}) satisfies CodebuffToolHandlerFunction<'update_report'>
