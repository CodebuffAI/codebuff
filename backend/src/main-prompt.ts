import { ClientAction } from '@codebuff/common/actions'
import { type CostMode } from '@codebuff/common/constants'
import {
  AgentTemplateTypes,
  SessionState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { ServerWebSocket } from 'bun'

import { renderToolResults } from '@codebuff/common/constants/tools'
import { checkTerminalCommand } from './check-terminal-command'
import { loopAgentSteps } from './run-agent-step'
import { ClientToolCall } from './tools'
import { logger } from './util/logger'
import { expireMessages } from './util/messages'
import { requestToolCall } from './websockets/websocket-action'

export interface MainPromptOptions {
  userId: string | undefined
  clientSessionId: string
  onResponseChunk: (chunk: string) => void
}

export const mainPrompt = async (
  ws: ServerWebSocket<any>,
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

      const response = await requestToolCall(ws, 'run_terminal_command', {
        command: terminalCommand,
        mode: 'user',
        process_type: 'SYNC',
        timeout_seconds: -1,
      })

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

  const agentType = (
    {
      ask: AgentTemplateTypes.gemini25pro_ask,
      lite: AgentTemplateTypes.gemini25flash_base,
      normal: AgentTemplateTypes.claude4_base,
      max: AgentTemplateTypes.opus4_base,
      experimental: AgentTemplateTypes.gemini25pro_base,
    } satisfies Record<CostMode, AgentTemplateType>
  )[costMode]

  const { agentState } = await loopAgentSteps(ws, {
    userInputId: promptId,
    prompt,
    params: undefined,
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
