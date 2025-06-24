import { ClientAction } from '@codebuff/common/actions'
import {
  SessionState,
  ToolResult,
  type AgentTemplateType,
} from '@codebuff/common/types/session-state'
import { type CostMode } from 'common/constants'
import { WebSocket } from 'ws'

import { getToolCallString } from '@codebuff/common/constants/tools'
import { generateCompactId } from '@codebuff/common/util/string'
import { runAgentStep } from './run-agent-step'
import { ClientToolCall } from './tools'

// Turn this on to collect full file context, using Claude-4-Opus to pick which files to send up
// TODO: We might want to be able to turn this on on a per-repo basis.
const COLLECT_FULL_FILE_CONTEXT = false

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

  const agentType = (
    {
      ask: 'claude4_base',
      lite: 'gemini25flash_base',
      normal: 'claude4_base',
      max: 'claude4_base',
      experimental: 'gemini25pro_base',
    } satisfies Record<CostMode, AgentTemplateType>
  )[costMode]

  const { agentState: newAgentState, fullResponse } = await runAgentStep(ws, {
    userId,
    userInputId: promptId,
    clientSessionId,
    fingerprintId,
    onResponseChunk,

    agentType,
    fileContext,
    agentState: mainAgentState,
    prompt,
  })

  return {
    sessionState: {
      fileContext,
      mainAgentState: newAgentState,
    },
    toolCalls: fullResponse.includes(getToolCallString('end_turn', {}))
      ? [{ toolName: 'end_turn', toolCallId: generateCompactId(), args: {} }]
      : [],
    toolResults: [],
  }
}
