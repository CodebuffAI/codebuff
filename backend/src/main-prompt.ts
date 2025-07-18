import { ClientAction } from '@codebuff/common/actions'
import { type CostMode } from '@codebuff/common/constants'
import {
  AgentTemplateTypes,
  SessionState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { WebSocket } from 'ws'

import { renderToolResults } from '@codebuff/common/constants/tools'
import { checkTerminalCommand } from './check-terminal-command'
import { loopAgentSteps } from './run-agent-step'
import { agentRegistry } from './templates/agent-registry'
import { ClientToolCall } from './tools/constants'
import { logger } from './util/logger'
import { expireMessages } from './util/messages'
import { requestToolCall } from './websockets/websocket-action'

export interface MainPromptOptions {
  userId: string | undefined
  clientSessionId: string
  onResponseChunk: (chunk: string) => void
}

export const mainPrompt = async (
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  options: MainPromptOptions
): Promise<{
  sessionState: SessionState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> => {
  const { userId, clientSessionId, onResponseChunk } = options

  const {
    prompt,
    sessionState: sessionState,
    fingerprintId,
    costMode,
    promptId,
    agentId,
    promptParams,
  } = action
  const { fileContext, mainAgentState } = sessionState

  if (prompt) {
    // Check if this is a direct terminal command
    const startTime = Date.now()
    const terminalCommand = await checkTerminalCommand(prompt, {
      clientSessionId,
      fingerprintId,
      userInputId: promptId,
      userId,
    })
    const duration = Date.now() - startTime

    if (terminalCommand) {
      logger.debug(
        {
          duration,
          prompt,
        },
        `Detected terminal command in ${duration}ms, executing directly: ${prompt}`
      )

      const response = await requestToolCall(
        ws,
        promptId,
        'run_terminal_command',
        {
          command: terminalCommand,
          mode: 'user',
          process_type: 'SYNC',
          timeout_seconds: -1,
        }
      )

      const toolResult = response.success ? response.result : response.error
      if (response.success) {
        mainAgentState.messageHistory.push({
          role: 'user',
          content: renderToolResults([toolResult]),
        })
      }

      const newSessionState = {
        ...sessionState,
        messageHistory: expireMessages(
          mainAgentState.messageHistory,
          'userPrompt'
        ),
      }

      return {
        sessionState: newSessionState,
        toolCalls: [],
        toolResults: [],
      }
    }
  }

  // Determine agent type - prioritize CLI agent selection over cost mode
  let agentType: AgentTemplateType

  if (agentId) {
    // Initialize agent registry to validate agent ID
    await agentRegistry.initialize(fileContext)

    if (!agentRegistry.hasAgent(agentId)) {
      const availableAgents = agentRegistry.getAvailableTypes()
      throw new Error(
        `Invalid agent ID: "${agentId}". Available agents: ${availableAgents.join(', ')}`
      )
    }

    agentType = agentId
    logger.info(
      {
        agentId,
        promptParams,
        prompt: prompt?.slice(0, 50),
      },
      `Using CLI-specified agent: ${agentId}`
    )
  } else {
    // Fall back to cost mode mapping
    agentType = (
      {
        ask: AgentTemplateTypes.ask,
        lite: AgentTemplateTypes.base_lite,
        normal: AgentTemplateTypes.base,
        max: AgentTemplateTypes.base_max,
        experimental: AgentTemplateTypes.base_experimental,
      } satisfies Record<CostMode, AgentTemplateType>
    )[costMode]
  }

  mainAgentState.agentType = agentType

  const { agentState } = await loopAgentSteps(ws, {
    userInputId: promptId,
    prompt,
    params: promptParams,
    agentType,
    agentState: mainAgentState,
    fingerprintId,
    fileContext,
    toolResults: [],
    userId,
    clientSessionId,
    onResponseChunk,
  })

  return {
    sessionState: {
      fileContext,
      mainAgentState: agentState,
    },
    toolCalls: [],
    toolResults: [],
  }
}
