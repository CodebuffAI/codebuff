import { insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import {
  ASYNC_AGENTS_ENABLED,
  supportsCacheControl,
} from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  getToolCallString,
  renderToolResults,
} from '@codebuff/common/tools/utils'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'

import { asyncAgentManager } from './async-agent-manager'
import { getFileReadingUpdates } from './get-file-reading-updates'
import { checkLiveUserInput } from './live-user-inputs'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { runProgrammaticStep } from './run-programmatic-step'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { saveAgentRequest } from './system-prompt/save-agent-request'
import { getAgentTemplate } from './templates/agent-registry'
import { getAgentPrompt } from './templates/strings'
import { processStreamWithTools } from './tools/stream-parser'
import { logger } from './util/logger'
import {
  asSystemInstruction,
  asSystemMessage,
  asUserMessage,
  messagesWithSystem,
  expireMessages,
  getMessagesSubset,
  isSystemInstruction,
} from './util/messages'
import { isToolResult, renderReadFilesResult } from './util/parse-tool-call-xml'
import { simplifyReadFileResults } from './util/simplify-tool-results'
import { countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentResponseTrace } from '@codebuff/bigquery'
import type { CodebuffMessage } from '@codebuff/common/types/message'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  ToolResult,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

export interface AgentOptions {
  userId: string | undefined
  userInputId: string
  clientSessionId: string
  fingerprintId: string
  onResponseChunk: (chunk: string | PrintModeEvent) => void

  agentType: AgentTemplateType
  fileContext: ProjectFileContext
  agentState: AgentState
  localAgentTemplates: Record<string, AgentTemplate>

  prompt: string | undefined
  params: Record<string, any> | undefined
}

export const runAgentStep = async (
  ws: WebSocket,
  options: AgentOptions,
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
}> => {
  const {
    userId,
    userInputId,
    fingerprintId,
    clientSessionId,
    onResponseChunk,
    fileContext,
    agentType,
    localAgentTemplates,
    prompt,
    params,
  } = options
  let agentState = options.agentState

  const { agentContext } = agentState

  const startTime = Date.now()
  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

  // Generates a unique ID for each main prompt run (ie: a step of the agent loop)
  // This is used to link logs within a single agent loop
  const agentStepId = crypto.randomUUID()
  trackEvent(AnalyticsEvent.AGENT_STEP, userId ?? '', {
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    repoName: repoId,
  })

  let messageHistory = agentState.messageHistory
  const messagesWithUserPrompt = prompt
    ? [
        ...messageHistory.map((m) => ({ ...m, keepDuringTruncation: false })),
        {
          role: 'user' as const,
          content: asUserMessage(prompt),
          keepDuringTruncation: true,
        },
      ]
    : messageHistory

  // Check number of assistant messages since last user message with prompt
  if (agentState.stepsRemaining <= 0) {
    logger.warn(
      `Detected too many consecutive assistant messages without user prompt`,
    )

    const warningString = [
      "I've made quite a few responses in a row.",
      "Let me pause here to make sure we're still on the right track.",
      "Please let me know if you'd like me to continue or if you'd like to guide me in a different direction.",
    ].join(' ')

    onResponseChunk(`${warningString}\n\n`)

    return {
      agentState: {
        ...agentState,
        messageHistory: [
          ...expireMessages(messagesWithUserPrompt, 'userPrompt'),
          {
            role: 'user',
            content: asSystemMessage(
              `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in codebuff.json.`,
            ),
          },
        ],
      },
      fullResponse: warningString,
      shouldEndTurn: true,
    }
  }

  const { addedFiles, updatedFilePaths, clearReadFileToolResults } =
    await getFileReadingUpdates(ws, messagesWithUserPrompt, fileContext, {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoId,
    })
  if (clearReadFileToolResults) {
    // Update message history.
    for (const message of messageHistory) {
      if (isToolResult(message)) {
        message.content = simplifyReadFileResults(message.content)
      }
    }

    messageHistory = messageHistory.filter((message) => {
      return (
        typeof message.content !== 'string' ||
        !isSystemInstruction(message.content)
      )
    })
  }

  const toolResults: ToolResult[] = []

  const updatedFiles = addedFiles.filter((f) =>
    updatedFilePaths.includes(f.path),
  )

  if (updatedFiles.length > 0) {
    toolResults.push({
      toolName: 'file_updates',
      toolCallId: generateCompactId(),
      result:
        `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
        renderReadFilesResult(updatedFiles, fileContext.tokenCallers ?? {}),
    })
  }

  const hasPrompt = Boolean(prompt || params)

  if (ASYNC_AGENTS_ENABLED) {
    // Register this agent in the async manager so it can receive messages
    const isRegistered = asyncAgentManager.getAgent(agentState.agentId)
    if (!isRegistered && userId) {
      asyncAgentManager.registerAgent({
        agentState,
        sessionId: clientSessionId,
        userId,
        fingerprintId,
        userInputId,
        ws,
        fileContext,
        startTime: new Date(),
        status: 'running',
      })
    } else {
      // Update status to running for existing agents
      asyncAgentManager.updateAgentState(agentState, 'running')
    }

    // Check for pending messages from other agents
    const pendingMessages = asyncAgentManager.getAndClearMessages(
      agentState.agentId,
    )
    for (const message of pendingMessages) {
      toolResults.push({
        toolName: 'send_agent_message',
        toolCallId: generateCompactId(),
        result: `Message from agent ${message.fromAgentId}:\n\nPrompt: ${message.prompt}${message.params ? `\n\nParams: ${JSON.stringify(message.params, null, 2)}` : ''}`,
      })
    }
  }

  const agentTemplate = await getAgentTemplate(agentType, localAgentTemplates)
  if (!agentTemplate) {
    throw new Error(
      `Agent template not found for type: ${agentType}. Available types: ${Object.keys(localAgentTemplates).join(', ')}`,
    )
  }

  const stepPrompt = await getAgentPrompt(
    agentTemplate,
    { type: 'stepPrompt' },
    fileContext,
    agentState,
    localAgentTemplates,
  )

  // Extract instructions prompt to match hasPrompt && {...} pattern
  const instructionsPrompt = hasPrompt
    ? await getAgentPrompt(
        agentTemplate,
        { type: 'instructionsPrompt' },
        fileContext,
        agentState,
        localAgentTemplates,
      )
    : undefined

  const agentMessagesUntruncated = buildArray<CodebuffMessage>(
    ...expireMessages(messageHistory, prompt ? 'userPrompt' : 'agentStep').map(
      (m) => (prompt ? { ...m, keepDuringTruncation: false } : m),
    ),

    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderToolResults(toolResults)),
    },

    hasPrompt && [
      {
        // Actual user prompt!
        role: 'user' as const,
        content: asUserMessage(
          `${prompt ?? ''}${params ? `\n\n${JSON.stringify(params, null, 2)}` : ''}`,
        ),
      },
      prompt &&
        prompt in additionalSystemPrompts && {
          role: 'user' as const,
          content: asSystemInstruction(
            additionalSystemPrompts[
              prompt as keyof typeof additionalSystemPrompts
            ],
          ),
        },
    ],

    instructionsPrompt && {
      role: 'user' as const,
      content: instructionsPrompt,
      timeToLive: 'userPrompt' as const,
      keepDuringTruncation: true,
    },

    stepPrompt && {
      role: 'user' as const,
      content: stepPrompt,
      timeToLive: 'agentStep' as const,
      keepDuringTruncation: true,
    },
  )

  agentState.messageHistory = agentMessagesUntruncated

  const { handleSteps } = agentTemplate
  if (handleSteps) {
    const { agentState: newAgentState, endTurn } = await runProgrammaticStep(
      agentState,
      {
        ...options,
        ws,
        template: agentTemplate,
        localAgentTemplates,
      },
    )
    agentState = newAgentState
    if (endTurn) {
      return {
        agentState,
        fullResponse: '',
        shouldEndTurn: true,
      }
    }
  }

  const { model } = agentTemplate

  const getStream = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    template: agentTemplate,
  })

  const iterationNum = agentState.messageHistory.length

  const system =
    (await getAgentPrompt(
      agentTemplate,
      { type: 'systemPrompt' },
      fileContext,
      agentState,
      localAgentTemplates,
    )) ?? ''
  const systemTokens = countTokensJson(system)

  // Possibly truncated messagesWithUserMessage + cache.
  const agentMessages = getMessagesSubset(
    agentState.messageHistory,
    systemTokens,
    supportsCacheControl(agentTemplate.model),
  )

  const debugPromptCaching = false
  if (debugPromptCaching) {
    // Store the agent request to a file for debugging
    await saveAgentRequest(
      messagesWithSystem(agentMessages, system),
      userInputId,
    )
  }

  logger.debug(
    {
      agentMessages,
      agentId: agentState.agentId,
      system,
      prompt,
      params,
      agentContext,
      iteration: iterationNum,
      toolResults,
      systemTokens,
      model,
      agentTemplate,
      duration: Date.now() - startTime,
    },
    `Start agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  let fullResponse = ''
  toolResults.length = 0

  const stream = getStream(messagesWithSystem(agentMessages, system))

  const {
    toolCalls,
    toolResults: newToolResults,
    state,
    fullResponse: fullResponseAfterStream,
    fullResponseChunks,
  } = await processStreamWithTools({
    stream,
    ws,
    agentStepId,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    agentState,
    repoId,
    messages: agentMessages,
    agentTemplate,
    localAgentTemplates,
    fileContext,
    agentContext,
    onResponseChunk,
    fullResponse,
  })
  toolResults.push(...newToolResults)

  fullResponse = fullResponseAfterStream

  const agentResponseTrace: AgentResponseTrace = {
    type: 'agent-response',
    created_at: new Date(),
    agent_step_id: agentStepId,
    user_id: userId ?? '',
    id: crypto.randomUUID(),
    payload: {
      output: fullResponse,
      user_input_id: userInputId,
      client_session_id: clientSessionId,
      fingerprint_id: fingerprintId,
    },
  }

  insertTrace(agentResponseTrace)

  const newAgentContext = state.agentContext as AgentState['agentContext']
  // Use the updated agent state from tool execution
  agentState = state.agentState as AgentState

  let finalMessageHistoryWithToolResults = expireMessages(
    state.messages,
    'agentStep',
  )

  // Handle /compact command: replace message history with the summary
  const wasCompacted =
    prompt &&
    (prompt.toLowerCase() === '/compact' || prompt.toLowerCase() === 'compact')
  if (wasCompacted) {
    finalMessageHistoryWithToolResults = [
      {
        role: 'user',
        content: asSystemMessage(
          `The following is a summary of the conversation between you and the user. The conversation continues after this summary:\n\n${fullResponse}`,
        ),
      },
    ]
    logger.debug({ summary: fullResponse }, 'Compacted messages')
  }

  logger.debug(
    {
      iteration: iterationNum,
      agentId: agentState.agentId,
      prompt,
      fullResponse,
      fullResponseChunks,
      toolCalls,
      toolResults,
      agentContext: newAgentContext,
      finalMessageHistoryWithToolResults,
      model,
      agentTemplate,
      duration: Date.now() - startTime,
    },
    `End agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )
  const shouldEndTurn =
    toolCalls.some((call) => call.toolName === 'end_turn') ||
    (toolCalls.length === 0 && toolResults.length === 0)

  const newAgentState = {
    ...agentState,
    messageHistory: finalMessageHistoryWithToolResults,
    stepsRemaining: agentState.stepsRemaining - 1,
    agentContext: newAgentContext,
  }
  // Mark agent as completed if it should end turn
  if (ASYNC_AGENTS_ENABLED && shouldEndTurn) {
    asyncAgentManager.updateAgentState(newAgentState, 'completed')
  }

  return {
    agentState: newAgentState,
    fullResponse,
    shouldEndTurn,
  }
}

export const loopAgentSteps = async (
  ws: WebSocket,
  {
    userInputId,
    agentType,
    agentState,
    prompt,
    params,
    fingerprintId,
    fileContext,
    toolResults,
    localAgentTemplates,
    userId,
    clientSessionId,
    onResponseChunk,
  }: {
    userInputId: string
    agentType: AgentTemplateType
    agentState: AgentState
    prompt: string | undefined
    params: Record<string, any> | undefined
    fingerprintId: string
    fileContext: ProjectFileContext
    toolResults: ToolResult[]
    localAgentTemplates: Record<string, AgentTemplate>

    userId: string | undefined
    clientSessionId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
  },
) => {
  const agentTemplate = await getAgentTemplate(agentType, localAgentTemplates)
  if (!agentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  let currentPrompt = prompt
  let currentParams = params
  let currentAgentState = agentState
  while (checkLiveUserInput(userId, userInputId, clientSessionId)) {
    const {
      agentState: newAgentState,
      fullResponse,
      shouldEndTurn,
    } = await runAgentStep(ws, {
      userId,
      userInputId,
      clientSessionId,
      fingerprintId,
      onResponseChunk,
      localAgentTemplates,
      agentType,
      fileContext,
      agentState: currentAgentState,
      prompt: currentPrompt,
      params: currentParams,
    })

    if (ASYNC_AGENTS_ENABLED) {
      const hasMessages =
        asyncAgentManager.getMessages(newAgentState.agentId).length > 0
      if (hasMessages) {
        continue
      }
    }

    if (shouldEndTurn) {
      const hasEndTurn = fullResponse.includes(
        getToolCallString('end_turn', {}),
      )
      return {
        agentState: newAgentState,
        hasEndTurn,
      }
    }

    currentPrompt = undefined
    currentParams = undefined
    currentAgentState = newAgentState
  }

  return { agentState }
}
