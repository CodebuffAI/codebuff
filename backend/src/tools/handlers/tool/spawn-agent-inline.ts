import {
  validateSpawnState,
  validateAndGetAgentTemplate,
  validateAgentInput,
  logAgentSpawn,
  executeSubagent,
  createAgentState,
} from './spawn-agent-utils'
import type { Logger } from '@codebuff/types/logger'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

type ToolName = 'spawn_agent_inline'
export const handleSpawnAgentInline = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
  clientSessionId: string
  userInputId: string
  writeToClient: (chunk: string | PrintModeEvent) => void

  getLatestState: () => { messages: Message[] }
  state: {
    ws?: WebSocket
    fingerprintId?: string
    userId?: string
    agentTemplate?: AgentTemplate
    localAgentTemplates?: Record<string, AgentTemplate>
    messages?: Message[]
    agentState?: AgentState
    system?: string
  }
  logger: Logger
}): { result: Promise<CodebuffToolOutput<ToolName>>; state: {} } => {
  const {
    previousToolCallFinished,
    toolCall,
    fileContext,
    clientSessionId,
    userInputId,
    getLatestState,
    state,
    writeToClient,
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
    agentState: parentAgentState,
    system,
  } = validateSpawnState(state, 'spawn_agent_inline')

  const { logger } = params

  const triggerSpawnAgentInline = async () => {
    const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
      agentTypeStr,
      parentAgentTemplate,
      localAgentTemplates,
      logger,
    })

    validateAgentInput(agentTemplate, agentType, prompt, agentParams)

    // Create child agent state that shares message history with parent
    const childAgentState: AgentState = createAgentState(
      agentType,
      agentTemplate,
      parentAgentState,
      getLatestState().messages,
      parentAgentState.agentContext,
    )

    logAgentSpawn({
      agentTemplate,
      agentType,
      agentId: childAgentState.agentId,
      parentId: childAgentState.parentId,
      prompt,
      params: agentParams,
      inline: true,
      logger,
    })

    const result = await executeSubagent({
      ws,
      userInputId: `${userInputId}-inline-${agentType}${childAgentState.agentId}`,
      prompt: prompt || '',
      params: agentParams,
      agentTemplate,
      parentAgentState,
      agentState: childAgentState,
      fingerprintId,
      fileContext,
      localAgentTemplates,
      userId,
      clientSessionId,
      parentSystemPrompt: system,
      onResponseChunk: (chunk) => {
        // Disabled.
        // Inherits parent's onResponseChunk
        // writeToClient(chunk)
      },
      clearUserPromptMessagesAfterResponse: false,
      logger,
    })

    // Update parent's message history with child's final state
    // Since we share the same message array reference, this should already be updated
    let finalMessages = result.agentState?.messageHistory || state.messages

    state.messages = finalMessages

    // Update parent agent state to reflect shared message history
    if (parentAgentState && result.agentState) {
      parentAgentState.messageHistory = finalMessages
    }

    return undefined
  }

  return {
    result: (async () => {
      await previousToolCallFinished
      await triggerSpawnAgentInline()
      return []
    })(),
    state: {},
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
