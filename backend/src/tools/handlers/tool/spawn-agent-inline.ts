import {
  validateSpawnState,
  validateAndGetAgentTemplate,
  validateAgentInput,
  logAgentSpawn,
  executeAgent,
} from './spawn-agent-utils'
import { MAX_AGENT_STEPS_DEFAULT } from '@codebuff/common/constants/agents'
import { expireMessages } from '../../../util/messages'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'
import { generateCompactId } from '@codebuff/common/util/string'

export const handleSpawnAgentInline = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<'spawn_agent_inline'>
  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string

  getLatestState: () => { messages: CodebuffMessage[] }
  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    localAgentTemplates?: Record<string, AgentTemplate>
    messages?: CodebuffMessage[]
    agentState?: AgentState
  }
}): { result: Promise<undefined>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    fileContext,
    clientSessionId,
    userInputId,
    getLatestState,
    state,
  } = params
  const {
    agent_type: agentTypeStr,
    prompt,
    params: agentParams,
  } = toolCall.input
  const {
    ws,
    fingerprintId,
    userId,
    agentTemplate: parentAgentTemplate,
    localAgentTemplates,
    agentState,
  } = validateSpawnState(state, 'spawn_agent_inline')

  const triggerSpawnAgentInline = async () => {
    const { agentTemplate, agentType } = await validateAndGetAgentTemplate(
      agentTypeStr,
      parentAgentTemplate,
      localAgentTemplates,
    )

    validateAgentInput(agentTemplate, agentType, prompt, agentParams)

    // Create child agent state that shares message history with parent
    const childAgentState: AgentState = {
      agentId: generateCompactId(),
      agentType,
      agentContext: agentState.agentContext, // Inherit parent context directly
      subagents: [],
      messageHistory: getLatestState().messages, // Share the same message array
      stepsRemaining: MAX_AGENT_STEPS_DEFAULT,
      output: undefined,
      parentId: agentState.agentId,
    }

    logAgentSpawn(
      agentTemplate,
      agentType,
      childAgentState.agentId,
      childAgentState.parentId,
      prompt,
      agentParams,
      true, // inline = true
    )

    const result = await executeAgent({
      ws,
      userInputId: `${userInputId}-inline-${agentType}${childAgentState.agentId}`,
      prompt: prompt || '',
      params: agentParams,
      agentTemplate,
      agentState: childAgentState,
      fingerprintId,
      fileContext,
      localAgentTemplates,
      userId,
      clientSessionId,
      onResponseChunk: (chunk: string | PrintModeEvent) => {
        // Child agent output is streamed directly to parent's output
        // No need for special handling since we share message history
      },
    })

    // Update parent's message history with child's final state
    // Since we share the same message array reference, this should already be updated
    let finalMessages = result.agentState?.messageHistory || state.messages

    // Expire messages with timeToLive: 'userPrompt' to clean up inline agent's temporary messages
    finalMessages = expireMessages(finalMessages, 'userPrompt')

    state.messages = finalMessages

    // Update parent agent state to reflect shared message history
    if (agentState && result.agentState) {
      agentState.messageHistory = finalMessages
    }

    return undefined
  }

  return {
    result: previousToolCallFinished.then(triggerSpawnAgentInline),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<'spawn_agent_inline'>
