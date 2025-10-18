import { getMCPToolData } from '@codebuff/agent-runtime/mcp'
import { getAgentStreamFromTemplate } from '@codebuff/agent-runtime/prompt-agent-stream'
import { getAgentTemplate } from '@codebuff/agent-runtime/templates/agent-registry'
import {
  asSystemInstruction,
  asSystemMessage,
  buildUserMessageContent,
  messagesWithSystem,
  expireMessages,
} from '@codebuff/agent-runtime/util/messages'
import { countTokensJson } from '@codebuff/agent-runtime/util/token-counter'
import { insertTrace } from '@codebuff/bigquery'
import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { supportsCacheControl } from '@codebuff/common/old-constants'
import { TOOLS_WHICH_WONT_FORCE_NEXT_STEP } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { cloneDeep } from 'lodash'

import { checkLiveUserInput } from './live-user-inputs'
import { runProgrammaticStep } from './run-programmatic-step'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { getAgentPrompt } from './templates/strings'
import { processStreamWithTools } from './tools/stream-parser'
import { getAgentOutput } from './util/agent-output'
import { getRequestContext } from './websockets/request-context'

import type { AgentResponseTrace } from '@codebuff/bigquery'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { SendActionFn } from '@codebuff/common/types/contracts/client'
import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type {
  ToolResultPart,
  TextPart,
  ImagePart,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  AgentOutput,
} from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export const runAgentStep = async (
  params: {
    userId: string | undefined
    userInputId: string
    clientSessionId: string
    fingerprintId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void
    sendAction: SendActionFn

    agentType: AgentTemplateType
    fileContext: ProjectFileContext
    agentState: AgentState
    localAgentTemplates: Record<string, AgentTemplate>

    prompt: string | undefined
    spawnParams: Record<string, any> | undefined
    system: string
  } & ParamsExcluding<
    typeof processStreamWithTools,
    | 'stream'
    | 'agentStepId'
    | 'agentState'
    | 'repoId'
    | 'messages'
    | 'agentTemplate'
    | 'agentContext'
    | 'fullResponse'
  > &
    ParamsExcluding<
      typeof getAgentStreamFromTemplate,
      'agentId' | 'template' | 'onCostCalculated' | 'includeCacheControl'
    > &
    ParamsExcluding<typeof getAgentTemplate, 'agentId'> &
    ParamsExcluding<
      typeof getAgentPrompt,
      | 'agentTemplate'
      | 'promptType'
      | 'agentState'
      | 'agentTemplates'
      | 'additionalToolDefinitions'
    > &
    ParamsExcluding<
      typeof getMCPToolData,
      'toolNames' | 'mcpServers' | 'writeTo'
    >,
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
  messageId: string | null
}> => {
  const {
    userId,
    userInputId,
    fingerprintId,
    clientSessionId,
    onResponseChunk,
    sendAction,
    fileContext,
    agentType,
    localAgentTemplates,
    prompt,
    spawnParams,
    system,
    logger,
    promptAiSdkStream,
  } = params
  let agentState = params.agentState

  const { agentContext } = agentState

  const startTime = Date.now()
  // Get the extracted repo ID from request context
  const requestContext = getRequestContext()
  const repoId = requestContext?.processedRepoId

  // Generates a unique ID for each main prompt run (ie: a step of the agent loop)
  // This is used to link logs within a single agent loop
  const agentStepId = crypto.randomUUID()
  trackEvent({
    event: AnalyticsEvent.AGENT_STEP,
    userId: userId ?? '',
    properties: {
      agentStepId,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      repoName: repoId,
    },
    logger,
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

  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })
  if (!agentTemplate) {
    throw new Error(
      `Agent template not found for type: ${agentType}. Available types: ${Object.keys(localAgentTemplates).join(', ')}`,
    )
  }

  const stepPrompt = await getAgentPrompt({
    ...params,
    agentTemplate,
    promptType: { type: 'stepPrompt' },
    fileContext,
    agentState,
    agentTemplates: localAgentTemplates,
    logger,
    additionalToolDefinitions: () => {
      const additionalToolDefinitions = cloneDeep(
        Object.fromEntries(
          Object.entries(fileContext.customToolDefinitions).filter(
            ([toolName]) => agentTemplate.toolNames.includes(toolName),
          ),
        ),
      )
      return getMCPToolData({
        ...params,
        toolNames: agentTemplate.toolNames,
        mcpServers: agentTemplate.mcpServers,
        writeTo: additionalToolDefinitions,
      })
    },
  })

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
      messageId: null,
    }
  }

  const { model } = agentTemplate

  const { getStream } = getAgentStreamFromTemplate({
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    agentId: agentState.parentId ? agentState.agentId : undefined,
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
    sendAction,
    promptAiSdkStream,
    logger,
    includeCacheControl: supportsCacheControl(agentTemplate.model),
  })

  const iterationNum = agentState.messageHistory.length
  const systemTokens = countTokensJson(system)

  const agentMessages = agentState.messageHistory

  logger.debug(
    {
      iteration: iterationNum,
      agentId: agentState.agentId,
      model,
      duration: Date.now() - startTime,
      agentMessages: agentState.messageHistory,
      system,
      prompt,
      params: spawnParams,
      agentContext,
      systemTokens,
      agentTemplate,
    },
    `Start agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  let fullResponse = ''
  const toolResults: ToolResultPart[] = []

  const stream = getStream(
    messagesWithSystem({ messages: agentMessages, system }),
  )

  const {
    toolCalls,
    toolResults: newToolResults,
    state,
    fullResponse: fullResponseAfterStream,
    fullResponseChunks,
  } = await processStreamWithTools({
    ...params,
    stream,
    agentStepId,
    agentState,
    repoId,
    messages: agentMessages,
    agentTemplate,
    agentContext,
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

  insertTrace({ trace: agentResponseTrace, logger })

  const newAgentContext = state.agentContext as AgentState['agentContext']
  // Use the updated agent state from tool execution
  agentState = state.agentState as AgentState

  let finalMessageHistoryWithToolResults: Message[] = expireMessages(
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
      fullResponseChunks,
    },
    `End agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  return {
    agentState,
    fullResponse,
    shouldEndTurn,
    messageId: null,
  }
}

export async function loopAgentSteps(
  params: {
    userInputId: string
    agentType: AgentTemplateType
    agentState: AgentState
    prompt: string | undefined
    content?: Array<TextPart | ImagePart>
    spawnParams: Record<string, any> | undefined
    fingerprintId: string
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    clearUserPromptMessagesAfterResponse?: boolean
    parentSystemPrompt?: string

    userId: string | undefined
    clientSessionId: string
    onResponseChunk: (chunk: string | PrintModeEvent) => void

    startAgentRun: StartAgentRunFn
    finishAgentRun: FinishAgentRunFn
    addAgentStep: AddAgentStepFn
    logger: Logger
  } & ParamsExcluding<
    typeof runProgrammaticStep,
    | 'agentState'
    | 'template'
    | 'prompt'
    | 'toolCallParams'
    | 'stepsComplete'
    | 'stepNumber'
    | 'system'
  > &
    ParamsExcluding<typeof getAgentTemplate, 'agentId'> &
    ParamsExcluding<
      typeof getAgentPrompt,
      | 'agentTemplate'
      | 'promptType'
      | 'agentTemplates'
      | 'additionalToolDefinitions'
    > &
    ParamsExcluding<
      typeof getMCPToolData,
      'toolNames' | 'mcpServers' | 'writeTo'
    >,
): Promise<{
  agentState: AgentState
  output: AgentOutput
}> {
  const {
    userInputId,
    agentType,
    agentState,
    prompt,
    content,
    spawnParams,
    fingerprintId,
    fileContext,
    localAgentTemplates,
    userId,
    clientSessionId,
    onResponseChunk,
    clearUserPromptMessagesAfterResponse = true,
    parentSystemPrompt,
    startAgentRun,
    finishAgentRun,
    addAgentStep,
    logger,
  } = params

  const agentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })
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
    logger,
  })

  // Initialize message history with user prompt and instructions on first iteration
  const instructionsPrompt = await getAgentPrompt({
    ...params,
    agentTemplate,
    promptType: { type: 'instructionsPrompt' },
    agentTemplates: localAgentTemplates,
    additionalToolDefinitions: () => {
      const additionalToolDefinitions = cloneDeep(
        Object.fromEntries(
          Object.entries(fileContext.customToolDefinitions).filter(
            ([toolName]) => agentTemplate.toolNames.includes(toolName),
          ),
        ),
      )
      return getMCPToolData({
        ...params,
        toolNames: agentTemplate.toolNames,
        mcpServers: agentTemplate.mcpServers,
        writeTo: additionalToolDefinitions,
      })
    },
  })

  // Build the initial message history with user prompt and instructions
  // Generate system prompt once, using parent's if inheritParentSystemPrompt is true
  const system =
    agentTemplate.inheritParentSystemPrompt && parentSystemPrompt
      ? parentSystemPrompt
      : (await getAgentPrompt({
          ...params,
          agentTemplate,
          promptType: { type: 'systemPrompt' },
          agentTemplates: localAgentTemplates,
          additionalToolDefinitions: () => {
            const additionalToolDefinitions = cloneDeep(
              Object.fromEntries(
                Object.entries(fileContext.customToolDefinitions).filter(
                  ([toolName]) => agentTemplate.toolNames.includes(toolName),
                ),
              ),
            )
            return getMCPToolData({
              ...params,
              toolNames: agentTemplate.toolNames,
              mcpServers: agentTemplate.mcpServers,
              writeTo: additionalToolDefinitions,
            })
          },
        })) ?? ''

  const hasUserMessage = Boolean(
    prompt || (spawnParams && Object.keys(spawnParams).length > 0),
  )

  const initialMessages = buildArray<Message>(
    ...agentState.messageHistory,

    hasUserMessage && [
      {
        // Actual user message!
        role: 'user' as const,
        content: buildUserMessageContent(prompt, spawnParams, content),
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
      keepLastTags: ['INSTRUCTIONS_PROMPT'],
    },
  )

  let currentAgentState: AgentState = {
    ...agentState,
    messageHistory: initialMessages,
  }
  let shouldEndTurn = false
  let hasRetriedOutputSchema = false
  let currentPrompt = prompt
  let currentParams = spawnParams
  let totalSteps = 0

  try {
    while (true) {
      totalSteps++
      if (!checkLiveUserInput({ userId, userInputId, clientSessionId })) {
        logger.warn(
          {
            userId,
            userInputId,
            clientSessionId,
            totalSteps,
            runId,
            agentState,
          },
          'User input no longer live (likely cancelled)',
        )
        break
      }

      const startTime = new Date()

      // 1. Run programmatic step first if it exists
      if (agentTemplate.handleSteps) {
        const {
          agentState: programmaticAgentState,
          endTurn,
          stepNumber,
        } = await runProgrammaticStep({
          ...params,
          agentState: currentAgentState,
          template: agentTemplate,
          localAgentTemplates,
          prompt: currentPrompt,
          toolCallParams: currentParams,
          system,
          stepsComplete: shouldEndTurn,
          stepNumber: totalSteps,
        })
        currentAgentState = programmaticAgentState
        totalSteps = stepNumber

        shouldEndTurn = endTurn
      }

      // Check if output is required but missing
      if (
        agentTemplate.outputSchema &&
        currentAgentState.output === undefined &&
        shouldEndTurn &&
        !hasRetriedOutputSchema
      ) {
        hasRetriedOutputSchema = true
        logger.warn(
          {
            agentType,
            agentId: currentAgentState.agentId,
            runId,
          },
          'Agent finished without setting required output, restarting loop',
        )

        // Add system message instructing to use set_output
        const outputSchemaMessage = asSystemMessage(
          `You must use the "set_output" tool to provide a result that matches the output schema before ending your turn. The output schema is required for this agent.`,
        )

        currentAgentState.messageHistory = [
          ...currentAgentState.messageHistory,
          {
            role: 'user',
            content: outputSchemaMessage,
            keepDuringTruncation: true,
          },
        ]

        // Reset shouldEndTurn to continue the loop
        shouldEndTurn = false
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
      } = await runAgentStep({
        ...params,
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
        spawnParams: currentParams,
        system,
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
          logger,
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

    const status = checkLiveUserInput({ userId, userInputId, clientSessionId })
      ? 'completed'
      : 'cancelled'
    await finishAgentRun({
      userId,
      runId,
      status,
      totalSteps,
      directCredits: currentAgentState.directCreditsUsed,
      totalCredits: currentAgentState.creditsUsed,
      logger,
    })

    return {
      agentState: currentAgentState,
      output: getAgentOutput(currentAgentState, agentTemplate),
    }
  } catch (error) {
    logger.error(
      {
        error: getErrorObject(error),
        agentType,
        agentId: currentAgentState.agentId,
        runId,
        totalSteps,
        directCreditsUsed: currentAgentState.directCreditsUsed,
        creditsUsed: currentAgentState.creditsUsed,
      },
      'Agent execution failed',
    )
    const errorMessage = typeof error === 'string' ? error : `${error}`

    const status = checkLiveUserInput({ userId, userInputId, clientSessionId })
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
      logger,
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
