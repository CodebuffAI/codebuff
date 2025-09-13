import { insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  ASYNC_AGENTS_ENABLED,
  supportsCacheControl,
} from '@codebuff/common/old-constants'
import { TOOLS_WHICH_WONT_FORCE_NEXT_STEP } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'

import { addAgentStep, finishAgentRun, startAgentRun } from './agent-run'
import { asyncAgentManager } from './async-agent-manager'
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
} from './util/messages'
import { countTokensJson } from './util/token-counter'
import { getRequestContext } from './websockets/request-context'

import type { AgentResponseTrace } from '@codebuff/bigquery'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type {
  AssistantMessage,
  Message,
} from '@codebuff/common/types/messages/codebuff-message'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  AgentOutput,
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
  messageId: string | undefined
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
            `The assistant has responded too many times in a row. The assistant's turn has automatically been ended. The number of responses can be changed in codebuff.json.`,
          ),
        },
      ],
    }
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

  const agentMessagesUntruncated = buildArray<Message>(
    ...expireMessages(messageHistory, 'agentStep'),

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
      messageId: undefined,
    }
  }

  const { model } = agentTemplate

  const { getStream, messageIdPromise } = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    agentId: agentState.agentId,
    template: agentTemplate,
    onCostCalculated: async (credits: number) => {
      try {
        agentState.creditsUsed += credits
        agentState.directCreditsUsed += credits
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
      systemTokens,
      agentTemplate,
    },
    `Start agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  let fullResponse = ''
  const toolResults: ToolResultPart[] = []

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

  logger.debug(
    {
      iteration: iterationNum,
      agentId: agentState.agentId,
      model,
      prompt,
      shouldEndTurn,
      duration: Date.now() - startTime,
      fullResponse,
      fullResponseChunks,
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
    messageId: await messageIdPromise,
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
    localAgentTemplates,
    userId,
    clientSessionId,
    onResponseChunk,
    clearUserPromptMessagesAfterResponse = true,
  }: {
    userInputId: string
    agentType: AgentTemplateType
    agentState: AgentState
    prompt: string | undefined
    params: Record<string, any> | undefined
    fingerprintId: string
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    clearUserPromptMessagesAfterResponse?: boolean

    userId: string | undefined
    clientSessionId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
  },
): Promise<{
  agentState: AgentState
  output: AgentOutput
}> => {
  const agentTemplate = await getAgentTemplate(agentType, localAgentTemplates)
  if (!agentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  const runId = crypto.randomUUID()
  agentState.runId = runId
  await startAgentRun({
    runId,
    userId,
    agentId: agentTemplate.id,
    ancestorRunIds: agentState.ancestorRunIds,
  })

  // Initialize message history with user prompt and instructions on first iteration
  const hasPrompt = Boolean(
    prompt || (params && Object.keys(params).length > 0),
  )

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
  const initialMessages = buildArray<Message>(
    agentState.messageHistory.map((m) => ({
      ...m,
      keepDuringTruncation: false,
    })),

    hasPrompt && [
      {
        // Actual user prompt!
        role: 'user' as const,
        content: asUserMessage(
          buildArray([prompt, params && JSON.stringify(params, null, 2)]).join(
            '\n\n',
          ),
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

  let currentAgentState: AgentState = {
    ...agentState,
    messageHistory: initialMessages,
  }
  let shouldEndTurn = false
  let currentPrompt = prompt
  let currentParams = params
  let totalSteps = 0

  try {
    while (true) {
      totalSteps++
      if (!checkLiveUserInput(userId, userInputId, clientSessionId)) {
        break
      }

      const startTime = new Date()

      // 1. Run programmatic step first if it exists
      if (agentTemplate.handleSteps) {
        const {
          agentState: programmaticAgentState,
          endTurn,
          stepNumber,
        } = await runProgrammaticStep(currentAgentState, {
          userId,
          userInputId,
          clientSessionId,
          fingerprintId,
          onResponseChunk,
          fileContext,
          ws,
          template: agentTemplate,
          localAgentTemplates,
          prompt: currentPrompt,
          params: currentParams,
          stepsComplete: shouldEndTurn,
          stepNumber: totalSteps,
        })
        currentAgentState = programmaticAgentState
        totalSteps = stepNumber

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
        break
      }

      const creditsBefore = currentAgentState.directCreditsUsed
      const childrenBefore = currentAgentState.childRunIds.length
      const {
        agentState: newAgentState,
        shouldEndTurn: llmShouldEndTurn,
        messageId,
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

      if (newAgentState.runId) {
        await addAgentStep({
          userId,
          agentRunId: newAgentState.runId,
          stepNumber: totalSteps,
          credits: newAgentState.directCreditsUsed - creditsBefore,
          childRunIds: newAgentState.childRunIds.slice(childrenBefore),
          messageId,
          status: 'completed',
          startTime,
        })
      } else {
        logger.error('No runId found for agent state after finishing agent run')
      }

      currentAgentState = newAgentState
      shouldEndTurn = llmShouldEndTurn

      currentPrompt = undefined
      currentParams = undefined
    }

    if (clearUserPromptMessagesAfterResponse) {
      currentAgentState.messageHistory = expireMessages(
        currentAgentState.messageHistory,
        'userPrompt',
      )
    }

    const status = checkLiveUserInput(userId, userInputId, clientSessionId)
      ? 'completed'
      : 'cancelled'
    await finishAgentRun({
      userId,
      runId,
      status,
      totalSteps,
      directCredits: currentAgentState.directCreditsUsed,
      totalCredits: currentAgentState.creditsUsed,
    })

    return {
      agentState: currentAgentState,
      output: getAgentOutput(currentAgentState, agentTemplate),
    }
  } catch (error) {
    logger.error(
      {
        error: getErrorObject(error),
        agentId: currentAgentState.agentId,
        creditsUsed: currentAgentState.creditsUsed,
      },
      'Agent execution failed',
    )
    const errorMessage = typeof error === 'string' ? error : `${error}`

    const status = checkLiveUserInput(userId, userInputId, clientSessionId)
      ? 'failed'
      : 'cancelled'
    await finishAgentRun({
      userId,
      runId,
      status,
      totalSteps,
      directCredits: currentAgentState.directCreditsUsed,
      totalCredits: currentAgentState.creditsUsed,
      errorMessage,
    })

    const errorObject = getErrorObject(error)
    return {
      agentState: currentAgentState,
      output: {
        type: 'error',
        message: `${errorObject.name}: ${errorObject.message} ${errorObject.stack ? `\n${errorObject.stack}` : ''}`,
      },
    }
  }
}

function getAgentOutput(
  agentState: AgentState,
  agentTemplate: AgentTemplate,
): AgentOutput {
  if (agentTemplate.outputMode === 'structured_output') {
    return {
      type: 'structuredOutput',
      value: agentState.output ?? null,
    }
  }
  if (agentTemplate.outputMode === 'last_message') {
    const assistantMessages = agentState.messageHistory.filter(
      (message): message is AssistantMessage => message.role === 'assistant',
    )
    const lastAssistantMessage = assistantMessages[assistantMessages.length - 1]
    if (!lastAssistantMessage) {
      return {
        type: 'error',
        message: 'No response from agent',
      }
    }
    return {
      type: 'lastMessage',
      value: lastAssistantMessage.content,
    }
  }
  if (agentTemplate.outputMode === 'all_messages') {
    // Remove the first message, which includes the previous conversation history.
    const agentMessages = agentState.messageHistory.slice(1)
    return {
      type: 'allMessages',
      value: agentMessages,
    }
  }
  agentTemplate.outputMode satisfies never
  throw new Error(
    `Unknown output mode: ${'outputMode' in agentTemplate ? agentTemplate.outputMode : 'undefined'}`,
  )
}
