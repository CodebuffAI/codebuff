import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { generateCompactId } from '@codebuff/common/util/string'
import { uniq } from 'lodash'

import { checkTerminalCommand } from './check-terminal-command'
import { loopAgentSteps } from './run-agent-step'
import { getAgentTemplate } from './templates/agent-registry'
import { logger } from './util/logger'
import { expireMessages } from './util/messages'
import { requestToolCall } from './websockets/websocket-action'

import type { AgentTemplate } from './templates/types'
import type { ClientAction } from '@codebuff/common/actions'
import type { CostMode } from '@codebuff/common/old-constants'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  SessionState,
  AgentTemplateType,
  AgentOutput,
} from '@codebuff/common/types/session-state'
import type { WebSocket } from 'ws'

export interface MainPromptOptions {
  userId: string | undefined
  clientSessionId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void
  localAgentTemplates: Record<string, AgentTemplate>
}

export const mainPrompt = async (
  ws: WebSocket,
  action: ClientAction<'prompt'>,
  options: MainPromptOptions,
): Promise<{
  sessionState: SessionState
  output: AgentOutput
}> => {
  const { userId, clientSessionId, onResponseChunk, localAgentTemplates } =
    options

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
        `Detected terminal command in ${duration}ms, executing directly: ${prompt}`,
      )

      const { output } = await requestToolCall(
        ws,
        promptId,
        'run_terminal_command',
        {
          command: terminalCommand,
          mode: 'user',
          process_type: 'SYNC',
          timeout_seconds: -1,
        },
      )

      mainAgentState.messageHistory.push({
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'run_terminal_command',
          toolCallId: generateCompactId(),
          output: output,
        },
      })

      const newSessionState = {
        ...sessionState,
        messageHistory: expireMessages(
          mainAgentState.messageHistory,
          'userPrompt',
        ),
      }

      return {
        sessionState: newSessionState,
        output: {
          type: 'lastMessage',
          value: output,
        },
      }
    }
  }

  const availableAgents = Object.keys(localAgentTemplates)

  // Determine agent type - prioritize CLI agent selection, then config base agent, then cost mode
  let agentType: AgentTemplateType

  if (agentId) {
    if (!(await getAgentTemplate(agentId, localAgentTemplates))) {
      throw new Error(
        `Invalid agent ID: "${agentId}". Available agents: ${availableAgents.join(', ')}`,
      )
    }

    agentType = agentId
    logger.info(
      {
        agentId,
        promptParams,
        prompt: prompt?.slice(0, 50),
      },
      `Using CLI-specified agent: ${agentId}`,
    )
  } else {
    // Check for base agent in config
    const configBaseAgent = fileContext.codebuffConfig?.baseAgent
    if (configBaseAgent) {
      if (!(await getAgentTemplate(configBaseAgent, localAgentTemplates))) {
        throw new Error(
          `Invalid base agent in config: "${configBaseAgent}". Available agents: ${availableAgents.join(', ')}`,
        )
      }
      agentType = configBaseAgent
      logger.info(
        {
          configBaseAgent,
          promptParams,
          prompt: prompt?.slice(0, 50),
        },
        `Using config-specified base agent: ${configBaseAgent}`,
      )
    } else {
      // Fall back to cost mode mapping
      agentType = (
        {
          ask: AgentTemplateTypes.ask,
          lite: AgentTemplateTypes.base_lite,
          normal: AgentTemplateTypes.base,
          max: AgentTemplateTypes.base_max,
          experimental: 'base2',
        } satisfies Record<CostMode, AgentTemplateType>
      )[costMode]
    }
  }

  mainAgentState.agentType = agentType

  let mainAgentTemplate = await getAgentTemplate(agentType, localAgentTemplates)
  if (!mainAgentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  let updatedSubagents = mainAgentTemplate.spawnableAgents
  if (!agentId) {
    // If --agent is not specified, use the spawnableAgents from the codebuff config or add all local agents
    updatedSubagents =
      fileContext.codebuffConfig?.spawnableAgents ??
      uniq([...mainAgentTemplate.spawnableAgents, ...availableAgents])
  }
  mainAgentTemplate.spawnableAgents = updatedSubagents
  localAgentTemplates[agentType] = mainAgentTemplate

  const { agentState, output } = await loopAgentSteps(ws, {
    userInputId: promptId,
    prompt,
    params: promptParams,
    agentType,
    agentState: mainAgentState,
    fingerprintId,
    fileContext,
    userId,
    clientSessionId,
    onResponseChunk,
    localAgentTemplates,
  })

  logger.debug({ agentState }, 'Main prompt finished')

  return {
    sessionState: {
      fileContext,
      mainAgentState: agentState,
    },
    output: output ?? {
      type: 'error' as const,
      message: 'No output from agent',
    },
  }
}
