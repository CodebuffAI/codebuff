import { trackEvent } from '@codebuff/common/analytics'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'

import { loopAgentSteps } from './run-agent-step'
import {
  assembleLocalAgentTemplates,
  getAgentTemplate,
} from './templates/agent-registry'
import { dedupeClientToolResults } from './util/messages'

import type { AgentTemplate } from './templates/types'
import type { ClientAction } from '@codebuff/common/actions'
import type { CostMode } from '@codebuff/common/old-constants'
import type {
  RequestToolCallFn,
  SendActionFn,
} from '@codebuff/common/types/contracts/client'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  SessionState,
  AgentTemplateType,
  AgentOutput,
} from '@codebuff/common/types/session-state'

export async function mainPrompt(
  params: {
    action: ClientAction<'prompt'>

    onResponseChunk: (chunk: string | PrintModeEvent) => void
    localAgentTemplates: Record<string, AgentTemplate>

    requestToolCall: RequestToolCallFn
    logger: Logger
  } & ParamsExcluding<
    typeof loopAgentSteps,
    | 'userInputId'
    | 'spawnParams'
    | 'agentState'
    | 'prompt'
    | 'content'
    | 'agentType'
    | 'fingerprintId'
    | 'fileContext'
    | 'ancestorRunIds'
  > &
    ParamsExcluding<typeof getAgentTemplate, 'agentId'>,
): Promise<{
  sessionState: SessionState
  output: AgentOutput
}> {
  const { action, localAgentTemplates, logger } = params

  const {
    prompt,
    content,
    sessionState: sessionState,
    fingerprintId,
    costMode,
    promptId,
    agentId,
    promptParams,
  } = action
  const { fileContext, mainAgentState } = sessionState

  // Track user input analytics event
  // userId comes from params (passed through from loopAgentSteps)
  const userId = (params as { userId?: string }).userId
  if (typeof userId === 'string' && userId.trim() !== '') {
    trackEvent({
      event: AnalyticsEvent.USER_INPUT,
      userId,
      properties: {
        promptId,
        agentId,
        costMode,
        hasPrompt: !!prompt,
        hasContent: !!content,
        hasPromptParams: !!promptParams && Object.keys(promptParams).length > 0,
        promptParamsCount: promptParams ? Object.keys(promptParams).length : 0,
        fingerprintId,
        promptLength: prompt?.length ?? 0,
        contentLength: content?.length ?? 0,
        messageHistoryLength: mainAgentState.messageHistory.length,
      },
      logger,
    })
  }

  const availableAgents = Object.keys(localAgentTemplates)

  // Determine agent type - prioritize CLI agent selection, then cost mode
  let agentType: AgentTemplateType

  if (agentId) {
    const agentTemplate = await getAgentTemplate({ ...params, agentId })
    if (!agentTemplate) {
      throw new Error(
        `Invalid agent ID: "${agentId}". Available agents: ${availableAgents.join(', ')}`,
      )
    }

    agentType = agentId
  } else {
    agentType = (
      {
        ask: AgentTemplateTypes.ask,
        free: AgentTemplateTypes.base_free,
        lite: AgentTemplateTypes.base_free,
        normal: AgentTemplateTypes.base,
        max: AgentTemplateTypes.base_max,
        experimental: 'base2',
      } satisfies Record<CostMode, AgentTemplateType>
    )[costMode ?? 'normal'] ?? 'base2'
  }

  mainAgentState.agentType = agentType

  let mainAgentTemplate = await getAgentTemplate({
    ...params,
    agentId: agentType,
  })
  if (!mainAgentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }

  const { agentState, output } = await loopAgentSteps({
    ...params,
    userInputId: promptId,
    spawnParams: promptParams,
    agentState: mainAgentState,
    ancestorRunIds: [],
    prompt,
    content,
    agentType,
    fingerprintId,
    fileContext,
    costMode,
  })

  // Log a summary only: output can contain the full conversation
  // (type 'allMessages'), which bloats log files on long chats.
  logger.debug(
    {
      outputType: output?.type,
      messageCount:
        output && 'value' in output && Array.isArray(output.value)
          ? output.value.length
          : undefined,
    },
    'Main prompt finished',
  )

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

export async function callMainPrompt(
  params: {
    action: ClientAction<'prompt'>
    promptId: string
    sendAction: SendActionFn
    logger: Logger
    signal: AbortSignal
  } & ParamsExcluding<
    typeof mainPrompt,
    'localAgentTemplates' | 'onResponseChunk'
  >,
) {
  const { action, promptId, sendAction, logger } = params
  const { fileContext } = action.sessionState

  // Enforce server-side state authority: reset creditsUsed to 0
  // The server controls cost tracking, clients cannot manipulate this value
  action.sessionState.mainAgentState.creditsUsed = 0
  action.sessionState.mainAgentState.directCreditsUsed = 0

  // Add any extra tool results (e.g. from user-executed terminal commands) to message history
  // This allows the AI to see context from commands run between prompts.
  //
  // Skip ids that already carry a result. These arrive from public SDK input
  // (`run({ extraToolResults })`), and a caller retrying after a failed run has
  // no way to know whether its results were recorded before the failure — the
  // returned RunState is replayable, so the safe thing for it to do is resend.
  // A repeated tool_call_id then makes providers reject the whole history
  // ("Duplicate value for 'tool_call_id' of X in message[N]"), which wedges
  // every later turn in that conversation, not just this one.
  //
  // Matching on existing *results* rather than on every id keeps the legitimate
  // case working: answering a tool call that is still pending in history.
  if (action.toolResults && action.toolResults.length > 0) {
    const { messageHistory } = action.sessionState.mainAgentState
    const { fresh, duplicates } = dedupeClientToolResults({
      messageHistory,
      toolResults: action.toolResults,
    })

    if (duplicates.length > 0) {
      logger.warn(
        {
          userId: (params as { userId?: string }).userId,
          promptId,
          duplicateCount: duplicates.length,
          acceptedCount: fresh.length,
          toolNames: [...new Set(duplicates.map((r) => r.toolName))],
          messageCount: messageHistory.length,
        },
        'Skipped client tool results for already-answered tool calls',
      )
    }

    if (fresh.length > 0) {
      messageHistory.push(...fresh)
    }
  }

  // Assemble local agent templates from fileContext
  const { agentTemplates: localAgentTemplates, validationErrors } =
    assembleLocalAgentTemplates({ fileContext, logger })

  if (validationErrors.length > 0) {
    sendAction({
      action: {
        type: 'prompt-error',
        message: `Invalid agent config: ${validationErrors.map((err) => err.message).join('\n')}`,
        userInputId: promptId,
      },
    })
  }

  sendAction({
    action: {
      type: 'response-chunk',
      userInputId: promptId,
      chunk: {
        type: 'start',
        agentId: action.sessionState.mainAgentState.agentType ?? undefined,
        messageHistoryLength:
          action.sessionState.mainAgentState.messageHistory.length,
      },
    },
  })

  const result = await mainPrompt({
    ...params,
    localAgentTemplates,
    onResponseChunk: (chunk) => {
      if (!params.signal.aborted) {
        sendAction({
          action: {
            type: 'response-chunk',
            userInputId: promptId,
            chunk,
          },
        })
      }
    },
  })

  const { sessionState, output } = result

  sendAction({
    action: {
      type: 'response-chunk',
      userInputId: promptId,
      chunk: {
        type: 'finish',
        agentId: sessionState.mainAgentState.agentType ?? undefined,
        totalCost: sessionState.mainAgentState.creditsUsed,
      },
    },
  })

  // Send prompt data back
  sendAction({
    action: {
      type: 'prompt-response',
      promptId,
      sessionState,
      toolCalls: [],
      toolResults: [],
      output,
    },
  })

  return result
}
