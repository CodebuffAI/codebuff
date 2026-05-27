import { clearProposedContentForRun } from './proposed-content-store'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentState } from '@codebuff/common/types/session-state'

export const handleSetMessages = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'set_messages'>

  agentState: AgentState
}): Promise<{ output: CodebuffToolOutput<'set_messages'> }> => {
  const { previousToolCallFinished, toolCall, agentState } = params

  await previousToolCallFinished
  agentState.messageHistory = toolCall.input.messages

  // Clear the proposed content cache on retry to let the model re-emit a clean bundle from disk
  const lastMessage = toolCall.input.messages.at(-1)
  if (
    lastMessage &&
    typeof lastMessage === 'object' &&
    'tags' in lastMessage &&
    Array.isArray(lastMessage.tags) &&
    lastMessage.tags.includes('PROPOSAL_RETRY') &&
    agentState.runId
  ) {
    clearProposedContentForRun(agentState.runId)
  }

  return { output: [{ type: 'json', value: { message: 'Messages set.' } }] }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
