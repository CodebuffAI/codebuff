import { insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import {
  ASYNC_AGENTS_ENABLED,
  supportsCacheControl,
} from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { TOOLS_WHICH_WONT_FORCE_NEXT_STEP } from '@codebuff/common/tools/constants'
import { renderToolResults } from '@codebuff/common/tools/utils'
import { buildArray } from '@codebuff/common/util/array'
import { generateCompactId } from '@codebuff/common/util/string'

import { asyncAgentManager } from './async-agent-manager'
import { getFileReadingUpdates } from './get-file-reading-updates'
import { checkLiveUserInput } from './live-user-inputs'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { runProgrammaticStep } from './run-programmatic-step'
import { additionalSystemPrompts } from './system-prompt/prompts'
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

import type { AgentResponseTrace } from '@codebuff/bigquery'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { CodebuffMessage } from '@codebuff/common/types/messages/codebuff-message'
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

  // [storage] log initial sizes for the step
  const sizeof = (v: any) =>
    Buffer.byteLength(typeof v === 'string' ? v : JSON.stringify(v), 'utf8')
  logger.info(
    {
      tag: 'storage',
      agentId: agentState.agentId,
      stepId: agentStepId,
      messageCount: messageHistory.length,
      messageBytes: sizeof(messageHistory),
    },
    '[storage] agent step start sizes',
  )

  // Check if we need to warn about too many consecutive responses
  const needsStepWarning = agentState.stepsRemaining <= 0
  let stepWarningMessage = ''

  if (needsStepWarning) {
    logger.warn(
      `Detected too many consecutive assistant messages without user prompt`,
    )

    stepWarningMessage = [
      "I've made quite a few responses in a row.",
      "Let me pause here to make sure we're still on the right track.",
      "Please let me know if you'd like me to continue or if you'd like to guide me in a different direction.",
    ].join(' ')

    onResponseChunk(`${stepWarningMessage}\n\n`)

    // Update message history to include the warning
    agentState = {
      ...agentState,
      messageHistory: [
        ...expireMessages(messageHistory, 'userPrompt'),
        {
          role: 'user',
          content: asSystemMessage(
            `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in codebuff.json`,
          ),
        },
      ],
    }
  }

  const { addedFiles, updatedFilePaths, clearReadFileToolResults } =
    await getFileReadingUpdates(ws, messageHistory, fileContext, {
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
      output: {
        type: 'text',
        value:
          `These are the updates made to the files since the last response (either by you or by the user). These are the most recent versions of these files. You MUST be considerate of the user's changes:\n` +
          renderReadFilesResult(updatedFiles, fileContext.tokenCallers ?? {}),
      },
    })
  }

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

  const agentMessagesUntruncated = buildArray<CodebuffMessage>(
    ...expireMessages(messageHistory, 'agentStep'),

    toolResults.length > 0 && {
      role: 'user' as const,
      content: asSystemMessage(renderToolResults(toolResults)),
    },

    stepPrompt && {
      role: 'user' as const,
      content: stepPrompt,
      timeToLive: 'agentStep' as const,
      keepDuringTruncation: true,
    },
  )

  agentState.messageHistory = agentMessagesUntruncated

  // Early return for step warning case
  if (needsStepWarning) {
    return {
      agentState,
      fullResponse: stepWarningMessage,
      shouldEndTurn: true,
    }
  }

  const { model } = agentTemplate

  const getStream = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    agentId: agentState.agentId,
    template: agentTemplate,
    onCostCalculated: async (credits: number) => {
      try {
        agentState.creditsUsed += credits
        // Transactional cost attribution: ensure costs are actually deducted
        // This is already handled by the saveMessage function which calls updateUserCycleUsage
        // If that fails, the promise rejection will bubble up and halt agent execution
      } catch (error) {
        logger.error(
          { agentId: agentState.agentId, credits, error },
          'Failed to add cost to agent state',
        )
        throw new Error(
          `Cost tracking failed for agent ${agentState.agentId}: ${error}`,
        )
      }
    },
    includeCacheControl: supportsCacheControl(agentTemplate.model),
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
  )

  logger.debug(
    {
      iteration: iterationNum,
      agentId: agentState.agentId,
      model,
      duration: Date.now() - startTime,
      agentMessages,
      system,
      prompt,
      params,
      agentContext,
      toolResults,
      systemTokens,
      agentTemplate,
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

  // [storage] log results sizes from stream
  logger.info(
    {
      tag: 'storage',
      agentId: agentState.agentId,
      stepId: agentStepId,
      toolCallCount: toolCalls.length,
      newToolResultsCount: newToolResults.length,
      newToolResultsBytes: sizeof(newToolResults),
      fullResponseBytes: sizeof(fullResponseAfterStream),
    },
    '[storage] agent step stream results',
  )

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

  const hasNoToolResults =
    toolCalls.filter(
      (call) => !TOOLS_WHICH_WONT_FORCE_NEXT_STEP.includes(call.toolName),
    ).length === 0 &&
    toolResults.filter(
      (result) => !TOOLS_WHICH_WONT_FORCE_NEXT_STEP.includes(result.toolName),
    ).length === 0
  let shouldEndTurn =
    toolCalls.some((call) => call.toolName === 'end_turn') || hasNoToolResults

  agentState = {
    ...agentState,
    messageHistory: finalMessageHistoryWithToolResults,
    stepsRemaining: agentState.stepsRemaining - 1,
    agentContext: newAgentContext,
  }

  // Mark agent as completed if it should end turn
  if (ASYNC_AGENTS_ENABLED && shouldEndTurn) {
    asyncAgentManager.updateAgentState(agentState, 'completed')
  }

  // [storage] final message history sizes
  logger.info(
    {
      tag: 'storage',
      agentId: agentState.agentId,
      stepId: agentStepId,
      finalMessageCount: agentState.messageHistory.length,
      finalMessageBytes: sizeof(agentState.messageHistory),
    },
    '[storage] agent step end sizes',
  )

  logger.debug(
    {
      iteration: iterationNum,
      agentId: agentState.agentId,
      model,
      prompt,
      shouldEndTurn,
      duration: Date.now() - startTime,
      fullResponse,
      finalMessageHistoryWithToolResults: agentState.messageHistory,
      toolCalls,
      toolResults,
      agentContext: newAgentContext,
    },
    `End agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  return {
    agentState,
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

  // Initialize message history with user prompt and instructions on first iteration
  const hasPrompt = Boolean(prompt || params)

  // Get the instructions prompt if we have a prompt/params
  const instructionsPrompt = hasPrompt
    ? await getAgentPrompt(
        agentTemplate,
        { type: 'instructionsPrompt' },
        fileContext,
        agentState,
        localAgentTemplates,
      )
    : undefined

  // Build the initial message history with user prompt and instructions
  const initialMessages = buildArray<CodebuffMessage>(
    ...agentState.messageHistory.map((m) => ({
      ...m,
      keepDuringTruncation: false,
    })),

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
        keepDuringTruncation: true,
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
  )

  let currentAgentState = {
    ...agentState,
    messageHistory: initialMessages,
  }
  let shouldEndTurn = false
  let currentPrompt = prompt
  let currentParams = params

  try {
    while (checkLiveUserInput(userId, userInputId, clientSessionId)) {
      // 1. Run programmatic step first if it exists
      if (agentTemplate.handleSteps) {
        const { agentState: programmaticAgentState, endTurn } =
          await runProgrammaticStep(currentAgentState, {
            userId,
            userInputId,
            clientSessionId,
            fingerprintId,
            onResponseChunk,
            agentType,
            fileContext,
            ws,
            template: agentTemplate,
            localAgentTemplates,
            prompt: currentPrompt,
            params: currentParams,
            stepsComplete: shouldEndTurn,
          })
        currentAgentState = programmaticAgentState

        if (endTurn) {
          shouldEndTurn = true
        }
      }

      if (ASYNC_AGENTS_ENABLED) {
        const hasMessages =
          asyncAgentManager.getMessages(agentState.agentId).length > 0
        if (hasMessages) {
          shouldEndTurn = false
        }
      }

      // End turn if programmatic step ended turn, or if the previous runAgentStep ended turn
      if (shouldEndTurn) {
        return {
          agentState: currentAgentState,
        }
      }

      const { agentState: newAgentState, shouldEndTurn: llmShouldEndTurn } =
        await runAgentStep(ws, {
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

      currentAgentState = newAgentState
      shouldEndTurn = llmShouldEndTurn

      currentPrompt = undefined
      currentParams = undefined
    }

    return { agentState: currentAgentState }
  } catch (error) {
    // Log the error but still return the state with partial costs
    logger.error(
      {
        error,
        agentId: currentAgentState.agentId,
        creditsUsed: currentAgentState.creditsUsed,
      },
      'Agent execution failed but returning state with partial costs',
    )
    throw error
  } finally {
    // Ensure costs are always captured, even on failure
  }
}
