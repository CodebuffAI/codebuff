import { ClientAction } from '@codebuff/common/actions'
import {
  SessionState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { type CostMode } from '@codebuff/common/constants'
import { WebSocket } from 'ws'

import { generateCompactId } from '@codebuff/common/util/string'
import { checkTerminalCommand } from './check-terminal-command'
import { loopAgentSteps } from './run-agent-step'
import { agentTemplates } from './templates/agent-list'
import { ClientToolCall } from './tools'
import { logger } from './util/logger'
import { expireMessages } from './util/messages'

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
      const newSessionState = {
        ...sessionState,
        messageHistory: expireMessages(
          mainAgentState.messageHistory,
          'userPrompt'
        ),
      }
      return {
        sessionState: newSessionState,
        toolCalls: [
          {
            toolName: 'run_terminal_command',
            toolCallId: generateCompactId(),
            args: {
              command: terminalCommand,
              mode: 'user',
              process_type: 'SYNC',
              timeout_seconds: '-1',
            },
          },
        ],
        toolResults: [],
      }
    }
  }

  const agentType = (
    {
      ask: 'claude4_base',
      lite: 'gemini25flash_base',
      normal: 'claude4_base',
      max: 'claude4_base',
      experimental: 'gemini25pro_base',
    } satisfies Record<CostMode, AgentTemplateType>
  )[costMode]

  const agentTemplate = agentTemplates[agentType]
  const {
    initialAssistantMessage,
    initialAssistantPrefix,
    stepAssistantMessage,
    stepAssistantPrefix,
  } = agentTemplate

  const { agentState, hasEndTurn } = await loopAgentSteps(ws, {
    userInputId: promptId,
    prompt,
    initialAssistantMessage,
    initialAssistantPrefix,
    stepAssistantMessage,
    stepAssistantPrefix,
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
    toolCalls: hasEndTurn
      ? [
          {
            toolName: 'end_turn' as const,
            toolCallId: generateCompactId(),
            args: {},
          },
        ]
      : [],
    toolResults: [],
  }
}
