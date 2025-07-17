import { AgentState } from '@codebuff/common/types/session-state'
import { asyncAgentManager } from '../../async-agent-manager'
import { logger } from '../../util/logger'
import { CodebuffToolCall, CodebuffToolHandlerFunction } from '../constants'

export const handleSendAgentMessage = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'send_agent_message'>

  state: {
    mutableState?: {
      agentState: AgentState
    }
  }
}): { result: Promise<string>; state: {} } => {
  const { previousToolCallFinished, toolCall, state } = params
  const { target_agent_id, prompt, params: messageParams } = toolCall.args
  const mutableState = state.mutableState

  if (!mutableState?.agentState) {
    throw new Error(
      'Internal error for send_agent_message: Missing agentState in state'
    )
  }

  const sendMessage = async () => {
    const currentAgentId = mutableState.agentState.agentId
    let targetAgentId = target_agent_id

    // Handle special "PARENT_ID" case
    if (target_agent_id === 'PARENT_ID') {
      if (mutableState.agentState.parentId) {
        targetAgentId = mutableState.agentState.parentId
      } else {
        throw new Error('No parent agent found for this agent')
      }
    }

    // Verify target agent exists
    const targetAgent = asyncAgentManager.getAgent(targetAgentId)
    if (!targetAgent) {
      throw new Error(`Target agent ${targetAgentId} not found`)
    }

    // Send the message
    asyncAgentManager.sendMessage({
      fromAgentId: currentAgentId,
      toAgentId: targetAgentId,
      prompt,
      params: messageParams,
      timestamp: new Date(),
    })

    logger.debug(
      {
        fromAgentId: currentAgentId,
        toAgentId: targetAgentId,
        prompt: prompt.slice(0, 50) + '...',
      },
      'Sent message to agent'
    )

    return `Message sent to agent ${targetAgentId}`
  }

  // Send the message immediately.
  const resultPromise = sendMessage()

  return {
    result: previousToolCallFinished.then(() => resultPromise),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'send_agent_message'>
