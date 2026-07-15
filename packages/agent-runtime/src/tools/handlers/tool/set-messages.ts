import { commitTaskMemory } from '../../../util/task-memory'

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
  // Validate/prepare both replacements before mutating either field. This makes
  // semantic compaction transactional: a malformed or stale memory candidate
  // cannot replace the transcript while leaving durable operational memory old.
  const nextTaskMemory = toolCall.input.taskMemory
    ? commitTaskMemory({
        current: agentState.taskMemory,
        draft: toolCall.input.taskMemory,
        expectedRevision: toolCall.input.expectedTaskMemoryRevision,
      })
    : agentState.taskMemory
  const nextMessages = toolCall.input.messages
  agentState.messageHistory = nextMessages
  agentState.taskMemory = nextTaskMemory

  return { output: [{ type: 'json', value: { message: 'Messages set.' } }] }
}) satisfies CodebuffToolHandlerFunction<'set_messages'>
