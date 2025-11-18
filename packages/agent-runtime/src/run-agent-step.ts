import { insertTrace } from '@codebuff/bigquery'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { supportsCacheControl } from '@codebuff/common/old-constants'
import { TOOLS_WHICH_WONT_FORCE_NEXT_STEP } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { cloneDeep } from 'lodash'

import { checkLiveUserInput } from './live-user-inputs'
import { getMCPToolData } from './mcp'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { runProgrammaticStep } from './run-programmatic-step'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { getAgentTemplate } from './templates/agent-registry'
import { getAgentPrompt } from './templates/strings'
import { processStreamWithTools } from './tools/stream-parser'
import { getAgentOutput } from './util/agent-output'
import {
  asSystemInstruction,
  asSystemMessage,
  buildUserMessageContent,
  messagesWithSystem,
  expireMessages,
} from './util/messages'
import { countTokensJson } from './util/token-counter'

import type { AgentResponseTrace } from '@codebuff/bigquery'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type { CheckLiveUserInputFn } from '@codebuff/common/types/contracts/live-user-input'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  ParamsExcluding,
  ParamsOf,
} from '@codebuff/common/types/function-params'
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
    repoId: string | undefined
    onResponseChunk: (chunk: string | PrintModeEvent) => void

    agentType: AgentTemplateType
    fileContext: ProjectFileContext
    agentState: AgentState
    localAgentTemplates: Record<string, AgentTemplate>

    prompt: string | undefined
    spawnParams: Record<string, any> | undefined
    system: string
    n?: number

    trackEvent: TrackEventFn
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
    | 'onCostCalculated'
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
    > &
    ParamsExcluding<
      typeof getAgentStreamFromTemplate,
      'agentId' | 'template' | 'onCostCalculated' | 'includeCacheControl'
    >,
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
  messageId: string | null
  nResponses?: string[]
}> => {
  const {
    userId,
    userInputId,
    fingerprintId,
    clientSessionId,
    repoId,
    onResponseChunk,
    fileContext,
    agentType,
    localAgentTemplates,
    prompt,
    spawnParams,
    system,
    logger,
    trackEvent,
  } = params
  let agentState = params.agentState

  const { agentContext } = agentState

  const startTime = Date.now()

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
      tags: ['STEP_PROMPT'],

      // James: Deprecate the below, only use tags, which are not prescriptive.
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

  let stepCreditsUsed = 0

  const onCostCalculated = async (credits: number) => {
    stepCreditsUsed += credits
    agentState.creditsUsed += credits
    agentState.directCreditsUsed += credits
  }

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

  // Handle n parameter for generating multiple responses
  if (params.n !== undefined) {
    const responsesString = await params.promptAiSdk({
      ...params,
      messages: agentMessages,
      system,
      model,
      onCostCalculated,
      n: params.n,
    })

    let nResponses: string[]
    try {
      nResponses = JSON.parse(responsesString) as string[]
      if (!Array.isArray(nResponses)) {
        // If it parsed but isn't an array, treat as single response
        nResponses = [responsesString]
      }
    } catch (e) {
      // If parsing fails, treat as single raw response (common for n=1)
      nResponses = [responsesString]
    }
    
    // Update agent state with the message history including the generations
    agentState = {
      ...agentState,
      messageHistory: agentMessages,
    }
    
    return {
      agentState,
      fullResponse: responsesString,
      shouldEndTurn: false,
      messageId: null,
      nResponses,
    }
  }

  let fullResponse = ''
  const toolResults: ToolResultPart[] = []

  const { getStream } = getAgentStreamFromTemplate({
    ...params,
    agentId: agentState.parentId ? agentState.agentId : undefined,
    template: agentTemplate,
    onCostCalculated,
    includeCacheControl: supportsCacheControl(agentTemplate.model),
  })

  const stream = getStream(
    messagesWithSystem({ messages: agentMessages, system }),
  )

  const {
    toolCalls,
    toolResults: newToolResults,
    state,
    fullResponse: fullResponseAfterStream,
    fullResponseChunks,
    messageId,
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
    onCostCalculated,
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

  // Exception: if the only tool call is write_todos and all todos are completed, then end turn.
  let hasOnlyFinishedTodos = false
  if (
    toolCalls.every((call) => call.toolName === 'write_todos') &&
    toolCalls.some((call) =>
      (call.input.todos as { task: string; completed: boolean }[]).every(
        (todo) => todo.completed,
      ),
    )
  ) {
    hasOnlyFinishedTodos = true
  }

  const hasTaskCompleted = toolCalls.some(
    (call) =>
      call.toolName === 'task_completed' || call.toolName === 'end_turn',
  )

  // If the agent has the task_completed tool, it must be called to end its turn.
  const requiresExplicitCompletion =
    agentTemplate.toolNames.includes('task_completed')

  let shouldEndTurn: boolean
  if (requiresExplicitCompletion) {
    // For models requiring explicit completion, only end turn when:
    // - task_completed is called, OR
    // - end_turn is called (backward compatibility)
    shouldEndTurn = hasTaskCompleted
  } else {
    // For other models, also end turn when there are no tool calls or only a call to finished todos
    shouldEndTurn = hasTaskCompleted || hasNoToolResults || hasOnlyFinishedTodos
  }

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
      stepCreditsUsed,
    },
    `End agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  return {
    agentState,
    fullResponse,
    shouldEndTurn,
    messageId,
    nResponses: undefined,
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
    fileContext: ProjectFileContext
    localAgentTemplates: Record<string, AgentTemplate>
    clearUserPromptMessagesAfterResponse?: boolean
    parentSystemPrompt?: string
    signal: AbortSignal

    userId: string | undefined
    clientSessionId: string

    startAgentRun: StartAgentRunFn
    finishAgentRun: FinishAgentRunFn
    addAgentStep: AddAgentStepFn
    logger: Logger
  } & ParamsExcluding<
    typeof runProgrammaticStep,
    | 'runId'
    | 'agentState'
    | 'template'
    | 'prompt'
    | 'toolCallParams'
    | 'stepsComplete'
    | 'stepNumber'
    | 'system'
    | 'onCostCalculated'
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
    > &
    ParamsOf<CheckLiveUserInputFn> &
    ParamsExcluding<StartAgentRunFn, 'agentId' | 'ancestorRunIds'> &
    ParamsExcluding<
      FinishAgentRunFn,
      'runId' | 'status' | 'totalSteps' | 'directCredits' | 'totalCredits'
    > &
    ParamsExcluding<
      typeof runAgentStep,
      | 'agentState'
      | 'prompt'
      | 'spawnParams'
      | 'system'
      | 'runId'
      | 'textOverride'
    > &
    ParamsExcluding<
      AddAgentStepFn,
      | 'agentRunId'
      | 'stepNumber'
      | 'credits'
      | 'childRunIds'
      | 'messageId'
      | 'status'
      | 'startTime'
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
    fileContext,
    localAgentTemplates,
    userId,
    clientSessionId,
    clearUserPromptMessagesAfterResponse = true,
    parentSystemPrompt,
    signal,
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

  if (signal.aborted) {
    return {
      agentState,
      output: {
        type: 'error',
        message: 'Run cancelled by user',
      },
    }
  }

  const runId = await startAgentRun({
    ...params,
    agentId: agentTemplate.id,
    ancestorRunIds: agentState.ancestorRunIds,
  })
  if (!runId) {
    throw new Error('Failed to start agent run')
  }
  agentState.runId = runId

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
        tags: ['USER_PROMPT'],

        // James: Deprecate the below, only use tags, which are not prescriptive.
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
      tags: ['INSTRUCTIONS_PROMPT'],

      // James: Deprecate the below, only use tags, which are not prescriptive.
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
  let nResponses: string[] | undefined = undefined

  try {
    while (true) {
      totalSteps++
      if (!checkLiveUserInput(params)) {
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
      let textOverride = null
      let n: number | undefined = undefined

      if (agentTemplate.handleSteps) {
        const programmaticResult = await runProgrammaticStep({
          ...params,
          runId,
          agentState: currentAgentState,
          template: agentTemplate,
          localAgentTemplates,
          prompt: currentPrompt,
          toolCallParams: currentParams,
          system,
          stepsComplete: shouldEndTurn,
          stepNumber: totalSteps,
          nResponses,
          onCostCalculated: async (credits: number) => {
            agentState.creditsUsed += credits
            agentState.directCreditsUsed += credits
          },
        })
        const {
          agentState: programmaticAgentState,
          endTurn,
          stepNumber,
          generateN,
        } = programmaticResult
        textOverride = programmaticResult.textOverride
        n = generateN

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
        nResponses: generatedResponses,
      } = await runAgentStep({
        ...params,
        textOverride: textOverride,
        runId,
        agentState: currentAgentState,
        prompt: currentPrompt,
        spawnParams: currentParams,
        system,
        n,
      })

      if (newAgentState.runId) {
        await addAgentStep({
          ...params,
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
      nResponses = generatedResponses

      currentPrompt = undefined
      currentParams = undefined
    }

    if (clearUserPromptMessagesAfterResponse) {
      currentAgentState.messageHistory = expireMessages(
        currentAgentState.messageHistory,
        'userPrompt',
      )
    }

    const status = checkLiveUserInput(params) ? 'completed' : 'cancelled'
    await finishAgentRun({
      ...params,
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

    const status = checkLiveUserInput(params) ? 'failed' : 'cancelled'
    await finishAgentRun({
      ...params,
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
