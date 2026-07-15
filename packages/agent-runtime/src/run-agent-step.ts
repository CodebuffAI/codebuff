import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { supportsCacheControl } from '@codebuff/common/old-constants'
import { TOOLS_WHICH_WONT_FORCE_NEXT_STEP } from '@codebuff/common/tools/constants'
import { buildArray } from '@codebuff/common/util/array'
import {
  AbortError,
  extractApiErrorDetails,
  getErrorObject,
  isAbortError,
} from '@codebuff/common/util/error'
import { serializeCacheDebugCorrelation } from '@codebuff/common/util/cache-debug'
import {
  assistantMessage,
  systemMessage,
  userMessage,
} from '@codebuff/common/util/messages'
import { type ToolSet } from 'ai'
import { cloneDeep, mapValues } from 'lodash'

import { CACHE_DEBUG_FULL_LOGGING } from './constants'

import { getMCPToolData } from './mcp'
import { getAgentStreamFromTemplate } from './prompt-agent-stream'
import { getEffectiveAgentToolNames } from './util/agent-tool-names'
import {
  clearAgentGeneratorForRun,
  runProgrammaticStep,
} from './run-programmatic-step'
import {
  appendOrchestrationEvent,
  reconcileInterruptedLedgerSpawns,
} from './util/orchestration-ledger'
import { reconcileInterruptedPathLeases } from './util/workspace-path-leases'
import { additionalSystemPrompts } from './system-prompt/prompts'
import { getAgentTemplate } from './templates/agent-registry'
import { getBackgroundAgentJob } from './util/background-agent-jobs'
import {
  buildAgentToolSet,
  getModelVisibleSpawnableAgents,
} from './templates/prompts'
import { getAgentPrompt } from './templates/strings'
import { getToolSet } from './tools/prompts'
import { processStream } from './tools/stream-parser'
import { getAgentOutput } from './util/agent-output'
import {
  evaluateRepeatedStepLoop,
  REPEATED_STEP_LOOP_LIMIT,
} from './util/step-loop-guard'
import {
  initBudgetFromTemplate,
  checkBudgetExceeded,
} from './util/budget-enforcement'
import {
  createCacheDebugSnapshot,
  enrichCacheDebugSnapshotWithProviderRequest,
  enrichCacheDebugSnapshotWithUsage,
} from './util/cache-debug'
import {
  withSystemInstructionTags,
  withSystemTags as withSystemTags,
  buildUserMessageContent,
  expireMessages,
  extractPinnedContextBlocks,
  getContextCategoryTelemetry,
} from './util/messages'
import { countTokensJson } from './util/token-counter'
import {
  DEFAULT_MAX_CONTEXT_TOKENS,
  getEffectiveContextLimits,
  getSemanticCompactionBudget,
  maybePruneContext,
} from './util/context-pruning'
import { revokeImplicitReadAuthorizationsAfterCompaction } from './util/read-authorization'
import {
  commitTaskMemory,
  compileTaskMemoryContext,
  deriveTaskMemoryDraftFromMessages,
  mergeTaskMemoryDraft,
} from './util/task-memory'

import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  AddAgentStepFn,
  FinishAgentRunFn,
  StartAgentRunFn,
} from '@codebuff/common/types/contracts/database'
import type {
  CacheDebugUsageData,
  PromptAiSdkFn,
} from '@codebuff/common/types/contracts/llm'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type {
  Message,
  ToolMessage,
} from '@codebuff/common/types/messages/codebuff-message'
import type {
  TextPart,
  ImagePart,
} from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type {
  AgentTemplateType,
  AgentState,
  AgentOutput,
} from '@codebuff/common/types/session-state'
import type {
  CustomToolDefinitions,
  ProjectFileContext,
} from '@codebuff/common/util/file'

async function additionalToolDefinitions(
  params: {
    agentTemplate: AgentTemplate
    fileContext: ProjectFileContext
  } & ParamsExcluding<
    typeof getMCPToolData,
    'toolNames' | 'mcpServers' | 'writeTo'
  >,
): Promise<CustomToolDefinitions> {
  const { agentTemplate, fileContext } = params
  const effectiveToolNames = getEffectiveAgentToolNames(agentTemplate)

  const defs = cloneDeep(
    Object.fromEntries(
      Object.entries(fileContext.customToolDefinitions).filter(([toolName]) =>
        effectiveToolNames.includes(toolName),
      ),
    ),
  )
  return getMCPToolData({
    ...params,
    toolNames: effectiveToolNames,
    mcpServers: agentTemplate!.mcpServers,
    writeTo: defs,
  })
}

function canReuseParentTools(params: {
  agentTemplate: AgentTemplate
  parentTools: ToolSet | undefined
}): boolean {
  const { agentTemplate, parentTools } = params
  if (!parentTools) {
    return false
  }

  const parentToolNames = Object.keys(parentTools)
  const childToolNames = getEffectiveAgentToolNames(agentTemplate)

  // Only reuse the parent's tool schemas when they exactly match the child
  // agent's declared tools. Reusing a superset is unsafe: the model sees tools
  // that the child is not allowed to execute, and `toolChoice: "required"` can
  // force flaky subagents (notably editors/selectors) onto the wrong
  // tool. Exact-match reuse preserves prompt-cache stability where it is
  // actually valid without degrading scoped subagent tool contracts.
  return (
    parentToolNames.length === childToolNames.length &&
    childToolNames.every((toolName) => toolName in parentTools)
  )
}

export const runAgentStep = async (
  params: {
    userId: string | undefined
    userInputId: string
    clientSessionId: string
    costMode?: string
    fingerprintId: string
    repoId: string | undefined
    onResponseChunk: (chunk: string | PrintModeEvent) => void

    agentType: AgentTemplateType
    agentTemplate: AgentTemplate
    fileContext: ProjectFileContext
    agentState: AgentState
    localAgentTemplates: Record<string, AgentTemplate>

    prompt: string | undefined
    spawnParams: Record<string, any> | undefined
    system: string
    n?: number

    trackEvent: TrackEventFn
    promptAiSdk: PromptAiSdkFn
  } & ParamsExcluding<
    typeof processStream,
    | 'agentContext'
    | 'agentState'
    | 'agentStepId'
    | 'agentTemplate'
    | 'fullResponse'
    | 'messages'
    | 'onCostCalculated'
    | 'repoId'
    | 'stream'
  > &
    ParamsExcluding<
      typeof getAgentStreamFromTemplate,
      | 'agentId'
      | 'includeCacheControl'
      | 'messages'
      | 'onCostCalculated'
      | 'template'
    > &
    ParamsExcluding<typeof getAgentTemplate, 'agentId'> &
    ParamsExcluding<
      typeof getAgentPrompt,
      'agentTemplate' | 'promptType' | 'agentState' | 'agentTemplates'
    > &
    ParamsExcluding<
      typeof getMCPToolData,
      'toolNames' | 'mcpServers' | 'writeTo'
    > &
    ParamsExcluding<
      PromptAiSdkFn,
      'messages' | 'model' | 'onCostCalculated' | 'n'
    >,
): Promise<{
  agentState: AgentState
  fullResponse: string
  shouldEndTurn: boolean
  // True when shouldEndTurn is due to an explicit fixed step cap
  // (stepsRemaining === 0),
  // not a natural turn end. Threading this through loopAgentSteps →
  // runProgrammaticStep → the base2 generator lets orchestrators break out
  // instead of falling through to the validation/reviewer gate, which would
  // re-yield STEP and re-trigger the step-cap, causing an infinite loop.
  hitStepCap?: boolean
  messageId: string | null
  nResponses?: string[]
}> => {
  const {
    agentType,
    clientSessionId,
    fileContext,
    agentTemplate,
    fingerprintId,
    localAgentTemplates,
    logger,
    prompt,
    repoId,
    spawnParams,
    system,
    userId,
    userInputId,
    onResponseChunk,
    promptAiSdk,
    trackEvent,
    additionalToolDefinitions,
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

  if (agentState.stepsRemaining === 0) {
    logger.warn('Agent step limit reached; ending with a resumable checkpoint')

    onResponseChunk(`${STEP_CAP_REACHED_MESSAGE}\n\n`)

    // Persist the checkpoint as an assistant response. Streaming the text
    // without recording it left last_message agents with no assistant turn,
    // which was later misreported as "No response from agent".
    agentState = {
      ...agentState,
      messageHistory: [
        ...expireMessages(agentState.messageHistory, 'userPrompt'),
        assistantMessage({
          content: STEP_CAP_REACHED_MESSAGE,
          tags: ['STEP_CAP_REACHED'],
          keepDuringTruncation: true,
        }),
      ],
    }
    return {
      agentState,
      fullResponse: STEP_CAP_REACHED_MESSAGE,
      shouldEndTurn: true,
      hitStepCap: true,
      messageId: null,
    }
  }

  // Near-cap checkpoint nudge. stepsRemaining decrements by exactly 1 per step,
  // so the equality check fires at most once — a few steps before the cap — for
  // long-running tasks. It injects a one-time system note so the agent records
  // remaining work (via write_todos if available) and reaches a clean,
  // consistent stopping point (resumable next turn via persisted run state)
  // instead of being cut off mid-edit when stepsRemaining hits 0.
  if (agentState.stepsRemaining === NEAR_STEP_CAP_WARNING_THRESHOLD) {
    const hasWriteTodos =
      getEffectiveAgentToolNames(agentTemplate).includes('write_todos')
    const warningMessage = hasWriteTodos
      ? NEAR_STEP_CAP_WARNING_MESSAGE
      : NEAR_STEP_CAP_WARNING_MESSAGE_NO_WRITE_TODOS
    onResponseChunk(`${warningMessage}\n\n`)
    agentState = {
      ...agentState,
      messageHistory: [
        ...agentState.messageHistory,
        userMessage(withSystemTags(warningMessage)),
      ],
    }
  }

  // P1-5: Lazy-init per-run budget caps from the agent template on the first
  // step. This avoids threading config through run-state.ts/initialSessionState
  // and naturally handles subagents (each spawned agent runs runAgentStep with
  // its own template). Storing on agentState makes the cap visible to the
  // accumulation/enforcement checks below and survives across steps.
  // The init logic lives in util/budget-enforcement.ts (single source of truth,
  // unit-tested there).
  agentState = initBudgetFromTemplate(agentState, agentTemplate)

  // P1-5j: Pre-LLM-call budget check. Catches a cost budget already exceeded
  // by a prior step (e.g. an n-param path that accumulates cost onto agentState
  // without checking the budget) BEFORE making this step's LLM call. Without
  // this, a cap blown on step N's n-param path wouldn't be caught until step
  // N+1's post-accumulation check — one extra LLM call past the cap.
  // stepTotalInputTokens=0 here (no step has run yet), so only the cumulative
  // cost cap can trigger; the per-step token cap never fires with 0 tokens.
  const preStepBudgetCheck = checkBudgetExceeded(agentState, 0)
  if (preStepBudgetCheck.exceeded) {
    logger.warn(
      {
        agentId: agentState.agentId,
        reason: preStepBudgetCheck.reason,
        creditsUsed: agentState.creditsUsed,
      },
      'Agent step skipped LLM call due to budget cap already exceeded',
    )
    agentState = {
      ...agentState,
      messageHistory: [
        ...agentState.messageHistory,
        userMessage(withSystemTags(preStepBudgetCheck.message)),
      ],
    }
    onResponseChunk(`${preStepBudgetCheck.message}\n\n`)
    return {
      agentState,
      fullResponse: preStepBudgetCheck.message,
      shouldEndTurn: true,
      messageId: null,
      nResponses: undefined,
    }
  }

  const stepPrompt = await getAgentPrompt({
    ...params,
    agentTemplate,
    promptType: { type: 'stepPrompt' },
    fileContext,
    agentState,
    agentTemplates: localAgentTemplates,
    logger,
    additionalToolDefinitions,
  })

  const agentMessagesUntruncated = buildArray<Message>(
    ...expireMessages(agentState.messageHistory, 'agentStep'),

    stepPrompt &&
      userMessage({
        content: stepPrompt,
        tags: ['STEP_PROMPT'],

        // James: Deprecate the below, only use tags, which are not prescriptive.
        timeToLive: 'agentStep' as const,
        keepDuringTruncation: true,
      }),
  )

  agentState.messageHistory = agentMessagesUntruncated

  const { model } = agentTemplate

  let stepCreditsUsed = 0
  // Step-local cache token accumulators. Mirrors the stepCreditsUsed pattern:
  // accumulate into locals, apply once on the post-spread agentState. This
  // avoids the stale-closure mutation bug (C2.3) where late async usage
  // callbacks would mutate the pre-spread object.
  let stepCacheInputTokens = 0
  let stepCacheTotalInputTokens = 0

  // Accumulate step cost into a local. We deliberately do NOT mutate
  // `agentState.creditsUsed`/`directCreditsUsed` here: `agentState` is a `let`
  // that is reassigned by spread below (line ~595), and an in-place mutation
  // via this closure would hit the stale pre-spread object for any late
  // async cost callback. The accumulated `stepCreditsUsed` is applied once in
  // the final spread reassignment so callers always see the full total.
  const onCostCalculated = async (providerCostCents: number) => {
    stepCreditsUsed += providerCostCents
  }

  const iterationNum = agentState.messageHistory.length
  const systemTokens = countTokensJson(system)

  let cacheDebugCorrelation:
    | ReturnType<typeof createCacheDebugSnapshot>
    | undefined
  if (CACHE_DEBUG_FULL_LOGGING) {
    try {
      cacheDebugCorrelation = createCacheDebugSnapshot({
        agentType: String(agentType),
        system,
        toolDefinitions: params.tools
          ? Object.fromEntries(
              Object.entries(params.tools).map(([name, tool]) => [
                name,
                {
                  description: tool.description,
                  inputSchema: tool.inputSchema as {},
                },
              ]),
            )
          : {},
        messages: [systemMessage(system), ...agentState.messageHistory],
        logger,
        projectRoot: fileContext.projectRoot,
        runId: agentState.runId,
        userInputId,
        agentStepId,
        model,
      })
    } catch (err) {
      logger.warn({ error: err }, '[Cache Debug] Failed to create snapshot')
    }
  }

  const onCacheDebugProviderRequestBuilt = cacheDebugCorrelation
    ? ({
        provider,
        rawBody,
        normalizedBody,
      }: {
        provider: string
        rawBody: unknown
        normalizedBody?: unknown
      }) => {
        enrichCacheDebugSnapshotWithProviderRequest({
          correlation: cacheDebugCorrelation,
          provider,
          rawBody,
          normalized: normalizedBody ?? rawBody,
          logger,
        })
      }
    : undefined

  // The usage callback is UNCONDITIONAL: we always accumulate cache token
  // counts into step locals for the runtime aggregate hit-rate metric
  // (P0-3). The cache-debug snapshot enrichment (for CACHE_DEBUG_FULL_LOGGING)
  // is an additional side-effect layered on top, gated by correlation.
  const onCacheDebugUsageReceived = (usage: CacheDebugUsageData) => {
    stepCacheInputTokens += usage.cachedInputTokens ?? 0
    stepCacheTotalInputTokens += usage.inputTokens ?? 0
    if (cacheDebugCorrelation) {
      enrichCacheDebugSnapshotWithUsage({
        correlation: cacheDebugCorrelation,
        usage,
        logger,
      })
    }
  }
  const onModelContextResolved = (contextWindowTokens: number | undefined) => {
    agentState.contextWindowTokens = contextWindowTokens
  }

  logger.debug(
    {
      iteration: iterationNum,
      runId: agentState.runId,
      model,
      duration: Date.now() - startTime,
      contextTokenCount: agentState.contextTokenCount,
      // Limit debug-log message history to the most recent 50 messages to
      // avoid MB-sized log lines on long sessions. Reverse so the most recent
      // message appears first.
      agentMessages: agentState.messageHistory.slice(-50).reverse(),
      system,
      prompt,
      params: spawnParams,
      agentContext,
      systemTokens,
      agentTemplate: {
        id: agentTemplate.id,
        displayName: agentTemplate.displayName,
        model: agentTemplate.model,
        toolNames: getEffectiveAgentToolNames(agentTemplate),
        programmaticToolNames: agentTemplate.programmaticToolNames,
        spawnableAgents: agentTemplate.spawnableAgents,
        mcpServerNames: Object.keys(agentTemplate.mcpServers ?? {}),
      },
      tools: params.tools,
    },
    `Start agent ${agentType} step ${iterationNum} (${userInputId}${prompt ? ` - Prompt: ${prompt.slice(0, 20)}` : ''})`,
  )

  // Handle n parameter for generating multiple responses
  if (params.n !== undefined) {
    const result = await promptAiSdk({
      ...params,
      messages: agentState.messageHistory,
      model,
      n: params.n,
      onCostCalculated,
      cacheDebugCorrelation: cacheDebugCorrelation
        ? serializeCacheDebugCorrelation(cacheDebugCorrelation)
        : undefined,
      onCacheDebugProviderRequestBuilt,
      onCacheDebugUsageReceived,
    })

    if (result.aborted) {
      return {
        agentState: {
          ...agentState,
          // Apply any cost accrued before the abort (C2.3: avoid stale-closure
          // mutation; apply on the returned post-spread object).
          creditsUsed: agentState.creditsUsed + stepCreditsUsed,
          directCreditsUsed: agentState.directCreditsUsed + stepCreditsUsed,
          cacheInputTokens: agentState.cacheInputTokens + stepCacheInputTokens,
          cacheTotalInputTokens:
            agentState.cacheTotalInputTokens + stepCacheTotalInputTokens,
        },
        fullResponse: '',
        shouldEndTurn: true,
        messageId: null,
        nResponses: undefined,
      }
    }

    const responsesString = result.value
    let nResponses: string[]
    try {
      nResponses = JSON.parse(responsesString) as string[]
      if (!Array.isArray(nResponses)) {
        // Parsed but not an array: degrade to a single response rather than
        // throwing, so one malformed best-of-N completion can't kill the run.
        logger.warn(
          { n: params.n, response: responsesString.slice(0, 50) },
          'Expected JSON array response from LLM for n; got non-array, falling back to single response',
        )
        nResponses = [responsesString]
      }
    } catch (e) {
      // Parsing failed: degrade to a single raw response rather than throwing.
      logger.warn(
        { error: e, n: params.n },
        'Failed to parse n-response array from LLM; falling back to single response',
      )
      nResponses = [responsesString]
    }

    return {
      agentState: {
        ...agentState,
        // Apply the step's accumulated cost on the returned post-spread
        // object, not via in-place closure mutation (C2.3).
        creditsUsed: agentState.creditsUsed + stepCreditsUsed,
        directCreditsUsed: agentState.directCreditsUsed + stepCreditsUsed,
        cacheInputTokens: agentState.cacheInputTokens + stepCacheInputTokens,
        cacheTotalInputTokens:
          agentState.cacheTotalInputTokens + stepCacheTotalInputTokens,
      },
      fullResponse: responsesString,
      shouldEndTurn: false,
      messageId: null,
      nResponses,
    }
  }

  let fullResponse = ''
  const toolResults: ToolMessage[] = []

  // Raw stream from AI SDK
  const stream = getAgentStreamFromTemplate({
    ...params,
    // Use the stable agent type for model routing. Spawned subagents have a
    // generated runtime instance id in agentState.agentId; using that here
    // prevents openbuff.json overrides for generated runtime instance ids from matching.
    agentId: agentState.agentType ?? agentTemplate.id,
    costMode: params.costMode,
    cacheDebugCorrelation: cacheDebugCorrelation
      ? serializeCacheDebugCorrelation(cacheDebugCorrelation)
      : undefined,
    // NOTE: llm.ts overrides this value using the post-resolution
    // compatibility.stripCacheControl from getModelForRequest, so the model
    // string here is informational only. Passing '' when model is undefined
    // (deferred to openbuff.json) is safe for the same reason.
    includeCacheControl: supportsCacheControl(agentTemplate.model ?? ''),
    messages: [systemMessage(system), ...agentState.messageHistory],
    onCacheDebugProviderRequestBuilt,
    onCacheDebugUsageReceived,
    onModelContextResolved,
    template: agentTemplate,
    onCostCalculated,
  })

  const {
    fullResponse: fullResponseAfterStream,
    fullResponseChunks,
    hadToolCallError,
    messageId,
    toolCalls,
    toolResults: newToolResults,
  } = await processStream({
    ...params,
    agentContext,
    agentState,
    agentStepId,
    agentTemplate,
    fullResponse,
    messages: agentState.messageHistory,
    repoId,
    stream,
    onCostCalculated,
  })

  toolResults.push(...newToolResults)

  fullResponse = fullResponseAfterStream

  agentState.messageHistory = expireMessages(
    agentState.messageHistory,
    'agentStep',
  )

  // Handle /compact command: replace message history with the summary
  const wasCompacted =
    prompt &&
    (prompt.toLowerCase() === '/compact' || prompt.toLowerCase() === 'compact')
  if (wasCompacted) {
    // Use the same conversation-summary envelope as automatic compaction and
    // preserve the newest authoritative operational blocks, rather than the
    // first (potentially stale) knowledge-memory block in the transcript.
    const pinnedBlocks = extractPinnedContextBlocks(agentState.messageHistory)
    if (!pinnedBlocks.some((block) => block.startsWith('<knowledge_memory>'))) {
      for (
        let index = agentState.messageHistory.length - 1;
        index >= 0;
        index--
      ) {
        const message = agentState.messageHistory[index]
        if (message.role !== 'user') continue
        const rawText = message.content
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n')
        const plainText = rawText
          .replace(/<[^>]+>/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
        if (!plainText || /^(?:\/compact|compact)$/i.test(plainText)) continue
        const boundedGoal =
          plainText.length <= 2_400
            ? plainText
            : `${plainText.slice(0, 1_900)}...[truncated]...${plainText.slice(-400)}`
        pinnedBlocks.push(
          [
            '<knowledge_memory>',
            'Pinned structured knowledge memory. Preserve verbatim across compaction; this section is not subject to normal budget cutoff.',
            `Goal:\n  ${boundedGoal}`,
            '</knowledge_memory>',
          ].join('\n'),
        )
        break
      }
    }
    const summaryText = [
      '<conversation_summary>',
      'This is a summary of the conversation so far. The original messages have been condensed to save context space.',
      '<historical_memory>',
      fullResponse,
      ...pinnedBlocks,
      '</historical_memory>',
      '</conversation_summary>',
      'Previous context compacted into <knowledge_memory>; verify exact live files before editing.',
    ].join('\n\n')
    const compactedMemoryDraft = mergeTaskMemoryDraft(
      agentState.taskMemory,
      deriveTaskMemoryDraftFromMessages({
        messages: agentState.messageHistory,
        workspaceState: agentState.workspaceState,
        fallbackSummary: fullResponse,
      }),
    )
    agentState.taskMemory = commitTaskMemory({
      current: agentState.taskMemory,
      draft: compactedMemoryDraft,
      expectedRevision: agentState.taskMemory?.revision ?? -1,
    })
    agentState.messageHistory = [
      userMessage({
        content: withSystemTags(summaryText),
        keepDuringTruncation: pinnedBlocks.length > 0,
      }),
    ]
    logger.debug({ summary: fullResponse }, 'Compacted messages')
  }

  const hasNoToolResults =
    toolCalls.filter(
      (call) => !TOOLS_WHICH_WONT_FORCE_NEXT_STEP.includes(call.toolName),
    ).length === 0 &&
    toolResults.filter(
      (result) => !TOOLS_WHICH_WONT_FORCE_NEXT_STEP.includes(result.toolName),
    ).length === 0 &&
    !hadToolCallError // Tool call errors should also force another step so the agent can retry

  const hasTaskCompleted = toolCalls.some(
    (call) =>
      call.toolName === 'task_completed' || call.toolName === 'end_turn',
  )

  const hasSetOutput = toolCalls.some((call) => call.toolName === 'set_output')

  // If the response is only <think>...</think> tags with no other non-whitespace content,
  // the model was just thinking and should continue rather than end its turn.
  const responseWithoutThinkTags = fullResponse
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/, '')
    .trim()
  // A response is "think only" when the model produced thinking tags and
  // made NO tool calls at all. If any tool was called (even set_output),
  // the model did real work and should not be asked to keep thinking.
  const isThinkOnly =
    toolCalls.length === 0 &&
    hasNoToolResults &&
    responseWithoutThinkTags.length === 0 &&
    fullResponse.trim().length > 0

  // If the agent has the task_completed tool, it must be called to end its turn.
  const requiresExplicitCompletion =
    getEffectiveAgentToolNames(agentTemplate).includes('task_completed')

  let shouldEndTurn: boolean
  if (requiresExplicitCompletion) {
    // For models requiring explicit completion, only end turn when:
    // - task_completed is called, OR
    // - end_turn is called (backward compatibility)
    shouldEndTurn = hasTaskCompleted
  } else {
    // For other models, also end turn when there are no tool calls
    // Exception: if the response is only <think> tags, continue the turn
    shouldEndTurn = hasTaskCompleted || (hasNoToolResults && !isThinkOnly)
  }

  // For structured-output agents, once set_output successfully sets the
  // agent's output, the turn should end regardless of other heuristics.
  // This prevents reasoning models from getting stuck in think-only loops
  // after already providing their structured answer.
  // Only apply when the agent doesn't require explicit completion via
  // task_completed, to preserve task_completed semantics.
  if (
    !requiresExplicitCompletion &&
    agentTemplate.outputMode === 'structured_output' &&
    hasSetOutput &&
    agentState.output !== undefined
  ) {
    shouldEndTurn = true
  }

  const repeatedStepLoop = evaluateRepeatedStepLoop({
    previousSignature: agentState.lastStepProgressSignature,
    previousRepeatCount: agentState.repeatedStepProgressCount,
    toolCalls,
    toolResults,
    isThinkOnly,
    responseText: responseWithoutThinkTags,
    shouldEndTurn,
  })

  agentState = {
    ...agentState,
    stepsRemaining:
      agentState.stepsRemaining > 0
        ? agentState.stepsRemaining - 1
        : agentState.stepsRemaining,
    lastStepProgressSignature: repeatedStepLoop.signature,
    repeatedStepProgressCount: repeatedStepLoop.repeatCount,
    agentContext,
    // Apply the step's accumulated cost once, here, on the post-spread object.
    // This avoids the stale-closure mutation bug where late async cost callbacks
    // would mutate the pre-spread object (C2.3).
    creditsUsed: agentState.creditsUsed + stepCreditsUsed,
    directCreditsUsed: agentState.directCreditsUsed + stepCreditsUsed,
    // Apply the step's accumulated cache token counts (P0-3). Same stale-closure
    // avoidance as cost: accumulate in step locals, apply once on the
    // post-spread object so callers always see the full total.
    cacheInputTokens: agentState.cacheInputTokens + stepCacheInputTokens,
    cacheTotalInputTokens:
      agentState.cacheTotalInputTokens + stepCacheTotalInputTokens,
  }

  if (repeatedStepLoop.shouldStop) {
    const message = [
      `No-progress watchdog stopped the turn after ${REPEATED_STEP_LOOP_LIMIT} identical step patterns.`,
      'Current work and run state were preserved.',
      'Resume after changing the approach or inputs; productive runs are not limited by a fixed step count.',
    ].join(' ')
    agentState = {
      ...agentState,
      messageHistory: [
        ...agentState.messageHistory,
        assistantMessage({
          content: message,
          tags: ['NO_PROGRESS_LOOP_GUARD'],
          keepDuringTruncation: true,
        }),
      ],
    }
    onResponseChunk(`${message}\n\n`)
    return {
      agentState,
      fullResponse: message,
      shouldEndTurn: true,
      messageId: null,
      nResponses: undefined,
    }
  }

  // P1-5: Enforce per-run budgets after accumulation. If either cap is
  // exceeded, end the turn with a budget-exceeded system message so the user
  // sees why the run stopped. Only checked here at the main step-completion
  // return path — the n-param paths above are candidate-generation (returns
  // shouldEndTurn: false) or abort (already ending for a different reason),
  // so budget enforcement there would be redundant or noise.
  // The check + message formatting lives in util/budget-enforcement.ts
  // (single source of truth, unit-tested there).
  const budgetCheck = checkBudgetExceeded(agentState, stepCacheTotalInputTokens)
  if (budgetCheck.exceeded) {
    logger.warn(
      {
        agentId: agentState.agentId,
        reason: budgetCheck.reason,
        creditsUsed: agentState.creditsUsed,
        stepCacheTotalInputTokens,
      },
      'Agent step ended due to budget cap',
    )
    agentState = {
      ...agentState,
      messageHistory: [
        ...agentState.messageHistory,
        userMessage(withSystemTags(budgetCheck.message)),
      ],
    }
    onResponseChunk(`${budgetCheck.message}\n\n`)
    return {
      agentState,
      fullResponse: budgetCheck.message,
      shouldEndTurn: true,
      messageId: null,
      nResponses: undefined,
    }
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
      finalMessageHistoryWithToolResults: agentState.messageHistory
        .concat()
        .reverse(),
      toolCalls,
      toolResults,
      agentContext,
      fullResponseChunks,
      stepCreditsUsed,
      stepCacheInputTokens,
      stepCacheTotalInputTokens,
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

/**
 * Runs the agent loop.
 *
 * IMPORTANT: This function mutates `params.agentState` in place throughout the
 * run (not just at return time). Fields like `messageHistory`, `systemPrompt`,
 * `toolDefinitions`, `creditsUsed`, and `output` are updated as work progresses
 * so that callers holding a reference to the same object (e.g. the SDK's
 * `sessionState.mainAgentState`) see in-progress work immediately — which
 * matters when an error is thrown mid-run and the normal return path is
 * skipped.
 */
export async function loopAgentSteps(
  params: {
    addAgentStep: AddAgentStepFn
    agentState: AgentState
    agentType: string
    clearUserPromptMessagesAfterResponse?: boolean
    clientSessionId: string
    content?: Array<TextPart | ImagePart>
    costMode?: string
    fileContext: ProjectFileContext
    finishAgentRun: FinishAgentRunFn
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    parentSystemPrompt?: string
    parentTools?: ToolSet
    prompt: string | undefined
    signal: AbortSignal
    spawnParams: Record<string, any> | undefined
    startAgentRun: StartAgentRunFn
    userId: string | undefined
    userInputId: string
    agentTemplate?: AgentTemplate
    // P2-3: Mid-turn checkpoint. When provided, the loop invokes this callback
    // with a snapshot of the main agent's state after each step boundary,
    // time-throttled (default 30s) so a crashed/killed session can resume
    // mid-turn from the last checkpoint rather than losing all in-flight work.
    // Only fired for the main agent loop (callers only pass this for the top-
    // level run); subagent loops leave this undefined.
    onCheckpoint?: (agentState: AgentState) => void
    // P2-3: When true, the user prompt is already present in
    // `initialAgentState.messageHistory` (restored from a checkpoint), so the
    // loop must NOT re-append a USER_PROMPT message — doing so would duplicate
    // the prompt and corrupt the resumed context.
    resumeInterruptedTurn?: boolean
    // M4.1: Maximum context tokens before auto-pruning triggers. When
    // contextTokenCount exceeds this threshold, the loop proactively trims
    // message history via trimMessagesToFitTokenLimit. Defaults to 190k.
    maxContextLength?: number
    resolveModelContextWindow?: (params: {
      agentId?: string
      model?: string
    }) => number | undefined
  } & ParamsExcluding<typeof additionalToolDefinitions, 'agentTemplate'> &
    ParamsExcluding<
      typeof runProgrammaticStep,
      | 'agentState'
      | 'onCostCalculated'
      | 'prompt'
      | 'runId'
      | 'stepNumber'
      | 'stepsComplete'
      | 'system'
      | 'template'
      | 'toolCallParams'
      | 'tools'
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
    ParamsExcluding<StartAgentRunFn, 'agentId' | 'ancestorRunIds'> &
    ParamsExcluding<
      FinishAgentRunFn,
      'runId' | 'status' | 'totalSteps' | 'directCredits' | 'totalCredits'
    > &
    ParamsExcluding<
      typeof runAgentStep,
      | 'additionalToolDefinitions'
      | 'agentState'
      | 'agentTemplate'
      | 'prompt'
      | 'runId'
      | 'spawnParams'
      | 'system'
      | 'tools'
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
    addAgentStep,
    agentState: initialAgentState,
    agentType,
    clearUserPromptMessagesAfterResponse = true,
    clientSessionId,
    content,
    fileContext,
    finishAgentRun,
    localAgentTemplates,
    logger,
    parentSystemPrompt,
    parentTools,
    prompt,
    signal,
    spawnParams,
    startAgentRun,
    userId,
    userInputId,
    clientEnv,
    ciEnv,
    onCheckpoint,
    onResponseChunk,
    resumeInterruptedTurn,
    maxContextLength,
    resolveModelContextWindow,
  } = params

  let agentTemplate = params.agentTemplate
  if (!agentTemplate) {
    agentTemplate =
      (await getAgentTemplate({
        ...params,
        agentId: agentType,
      })) ?? undefined
  }

  if (!agentTemplate) {
    throw new Error(`Agent template not found for type: ${agentType}`)
  }
  const resolvedModelContextWindow = resolveModelContextWindow?.({
    agentId: agentTemplate.id,
    model: agentTemplate.model,
  })
  // Seed the state before the first programmatic step. The context-pruner runs
  // before the first LLM request, so waiting for the streaming callback would
  // make the first compaction use the legacy fallback even for 500k/1M models.
  initialAgentState.contextWindowTokens = resolvedModelContextWindow
  reconcileInterruptedLedgerSpawns(initialAgentState)
  reconcileInterruptedPathLeases(initialAgentState)
  if (
    !initialAgentState.orchestrationLedger?.events.some(
      (event) =>
        event.type === 'model_selected' &&
        event.runId === (initialAgentState.runId ?? initialAgentState.agentId),
    )
  ) {
    appendOrchestrationEvent({
      state: initialAgentState,
      event: {
        type: 'model_selected',
        runId: initialAgentState.runId ?? initialAgentState.agentId,
        agentType: agentTemplate.id,
        model: agentTemplate.model,
        contextWindowTokens: resolvedModelContextWindow,
        reason:
          'Resolved from the configured agent/model route before the first programmatic step.',
        workspaceRevision: initialAgentState.workspaceState?.revision,
        workspaceSnapshotId: initialAgentState.workspaceState?.snapshotId,
      },
    })
  }
  for (const job of initialAgentState.backgroundAgentJobs ?? []) {
    if (job.status === 'running' && !getBackgroundAgentJob(job.jobId)) {
      job.status = 'interrupted'
      job.completedAt = Date.now()
      job.error =
        'Background agent host process/session ended before a terminal receipt was recorded.'
    }
  }

  if (signal.aborted) {
    return {
      agentState: initialAgentState,
      output: {
        type: 'error',
        message: 'Run cancelled by user',
      },
    }
  }

  const runId = await startAgentRun({
    ...params,
    agentId: agentTemplate.id,
    ancestorRunIds: initialAgentState.ancestorRunIds,
  })
  if (!runId) {
    throw new Error('Failed to start agent run')
  }
  initialAgentState.runId = runId

  // Outer try/finally guarantees this run's in-memory programmatic-step state
  // is torn down on EVERY exit path after runId is assigned — including if the
  // prompt/tool setup below throws before the main loop's own try/catch is
  // reached. The inner try/catch (further down) keeps owning error handling and
  // the abort/failure return values; this wrapper only adds the cleanup.
  try {
    let cachedAdditionalToolDefinitions: CustomToolDefinitions | undefined
    // Use parent's tools for prompt caching when inheritParentSystemPrompt is true
    const useParentTools =
      agentTemplate.inheritParentSystemPrompt &&
      canReuseParentTools({ agentTemplate, parentTools })

    // Initialize message history with user prompt and instructions on first iteration
    const instructionsPrompt = await getAgentPrompt({
      ...params,
      agentTemplate,
      promptType: { type: 'instructionsPrompt' },
      agentTemplates: localAgentTemplates,
      useParentTools,
      additionalToolDefinitions: async () => {
        if (!cachedAdditionalToolDefinitions) {
          cachedAdditionalToolDefinitions = await additionalToolDefinitions({
            ...params,
            agentTemplate,
          })
        }
        return cachedAdditionalToolDefinitions
      },
    })

    // Build the initial message history with user prompt and instructions
    // Generate system prompt once, using parent's if inheritParentSystemPrompt is true
    let system: string
    if (agentTemplate.inheritParentSystemPrompt && parentSystemPrompt) {
      system = parentSystemPrompt
    } else if (
      // Reuse the session-cached system prompt to keep the system prefix
      // byte-stable across turns (enables provider prompt-cache hits). All
      // placeholders (CURRENT_DATE, FILE_TREE_PROMPT, SYSTEM_INFO_PROMPT,
      // GIT_CHANGES_PROMPT, KNOWLEDGE_FILES_CONTENTS, ROUTED_KNOWLEDGE_FILES,
      // PATTERNS_INDEX) are session-stable or day-granularity, so rebuilding
      // every turn only risks byte drift from disk re-reads / object key
      // ordering without picking up meaningful changes. The cache is
      // invalidated by mainPrompt clearing systemPrompt on agent-type change.
      initialAgentState.systemPrompt &&
      initialAgentState.agentType === agentType
    ) {
      system = initialAgentState.systemPrompt
    } else {
      const systemPrompt = await getAgentPrompt({
        ...params,
        agentTemplate,
        promptType: { type: 'systemPrompt' },
        agentTemplates: localAgentTemplates,
        additionalToolDefinitions: async () => {
          if (!cachedAdditionalToolDefinitions) {
            cachedAdditionalToolDefinitions = await additionalToolDefinitions({
              ...params,
              agentTemplate,
            })
          }
          return cachedAdditionalToolDefinitions
        },
      })
      system = systemPrompt ?? ''
    }

    // Build agent tools (agents as direct tool calls) for non-inherited tools
    const agentTools = useParentTools
      ? {}
      : await buildAgentToolSet({
          ...params,
          spawnableAgents: getModelVisibleSpawnableAgents(
            agentTemplate.spawnableAgents,
          ),
          spawnableAgentToolMode: agentTemplate.spawnableAgentToolMode,
          agentTemplates: localAgentTemplates,
        })

    const tools: ToolSet = useParentTools
      ? parentTools!
      : await getToolSet({
          toolNames: getEffectiveAgentToolNames(agentTemplate),
          additionalToolDefinitions: async () => {
            if (!cachedAdditionalToolDefinitions) {
              cachedAdditionalToolDefinitions = await additionalToolDefinitions(
                {
                  ...params,
                  agentTemplate,
                },
              )
            }
            return cachedAdditionalToolDefinitions
          },
          agentTools,
          skills: fileContext.skills ?? {},
        })

    // P2-3: On resume from a checkpoint, the user prompt is already in
    // messageHistory — do not re-add it. Duplicating it would double the prompt
    // and break the resumed context.
    const hasUserMessage =
      !resumeInterruptedTurn &&
      Boolean(
        prompt ||
        (spawnParams && Object.keys(spawnParams).length > 0) ||
        (content && content.length > 0),
      )

    const initialMessages = buildArray<Message>(
      ...initialAgentState.messageHistory,

      hasUserMessage && [
        {
          // Actual user message!
          role: 'user' as const,
          content: buildUserMessageContent(prompt, spawnParams, content),
          tags: ['USER_PROMPT'],
          sentAt: Date.now(),

          // James: Deprecate the below, only use tags, which are not prescriptive.
          keepDuringTruncation: true,
        },
        prompt &&
          prompt in additionalSystemPrompts &&
          userMessage(
            withSystemInstructionTags(
              additionalSystemPrompts[
                prompt as keyof typeof additionalSystemPrompts
              ],
            ),
          ),
        ,
      ],

      instructionsPrompt &&
        userMessage({
          content: instructionsPrompt,
          tags: ['INSTRUCTIONS_PROMPT'],

          // James: Deprecate the below, only use tags, which are not prescriptive.
          keepLastTags: ['INSTRUCTIONS_PROMPT'],
        }),
    )

    // Convert tools to a serializable format for context-pruner token counting
    const toolDefinitions = mapValues(tools, (tool) => ({
      description: tool.description,
      inputSchema: tool.inputSchema as {},
    }))

    const additionalToolDefinitionsWithCache = async () => {
      if (!cachedAdditionalToolDefinitions) {
        cachedAdditionalToolDefinitions = await additionalToolDefinitions({
          ...params,
          agentTemplate,
        })
      }
      return cachedAdditionalToolDefinitions
    }

    // Mutate initialAgentState so that in-progress work propagates back to the
    // caller's shared reference (e.g. SDK's sessionState.mainAgentState) even if
    // an error is thrown before we return.
    initialAgentState.messageHistory = initialMessages
    initialAgentState.systemPrompt = system
    initialAgentState.toolDefinitions = toolDefinitions
    let currentAgentState: AgentState = initialAgentState
    if (prompt?.trim()) {
      currentAgentState.lastStepProgressSignature = undefined
      currentAgentState.repeatedStepProgressCount = 0
    }

    // Convert tool definitions to Anthropic format for accurate token counting
    // Tool definitions are stored as { [name]: { description, inputSchema } }
    // Anthropic count_tokens API expects [{ name, description, input_schema }]
    const toolsForTokenCount = Object.entries(toolDefinitions).map(
      ([name, def]) => ({
        name,
        ...(def.description && { description: def.description }),
        ...(def.inputSchema && { input_schema: def.inputSchema }),
      }),
    )

    let shouldEndTurn = false
    let hasRetriedOutputSchema = false
    let currentPrompt = prompt
    let currentParams = spawnParams
    let totalSteps = 0
    let nResponses: string[] | undefined = undefined
    // True when the most recent LLM step ended due to an explicit step cap. Threading
    // this into the next programmatic-step invocation lets orchestrators (base2)
    // break out instead of falling through to the validation/reviewer gate, which
    // would re-yield STEP and re-trigger the step-cap, causing an infinite loop.
    let hitStepCap = false

    // P2-3: Mid-turn checkpoint throttle. Fire at most every 30s so lost work on
    // crash is bounded to ~30s regardless of step duration. The first step always
    // checkpoints (lastCheckpointTime starts at 0) so an early crash still has a
    // resume point. Only active when onCheckpoint is provided (main agent only).
    let lastCheckpointTime = 0
    const CHECKPOINT_INTERVAL_MS = 30_000
    const maybeCheckpoint = (state: AgentState, force = false) => {
      if (!onCheckpoint) {
        return
      }
      const now = Date.now()
      if (force || now - lastCheckpointTime >= CHECKPOINT_INTERVAL_MS) {
        lastCheckpointTime = now
        try {
          onCheckpoint(state)
        } catch (err) {
          // Checkpoint failures must never kill the run — log and continue.
          logger.warn(
            { error: err, runId },
            'Mid-turn checkpoint write failed (non-fatal)',
          )
        }
      }
    }

    try {
      while (true) {
        totalSteps++
        if (signal.aborted) {
          throw new AbortError()
        }

        const startTime = new Date()

        const stepPrompt = await getAgentPrompt({
          ...params,
          agentTemplate,
          promptType: { type: 'stepPrompt' },
          fileContext,
          agentState: currentAgentState,
          agentTemplates: localAgentTemplates,
          logger,
          additionalToolDefinitions: additionalToolDefinitionsWithCache,
        })
        const buildCompiledTaskMemoryMessage = (state: AgentState) =>
          state.taskMemory
            ? userMessage({
                content: withSystemTags(
                  compileTaskMemoryContext({
                    memory: state.taskMemory,
                    agentType: state.agentType,
                    contextWindowTokens: state.contextWindowTokens,
                    rootAgent: !state.parentId,
                  }),
                ),
                tags: ['TASK_MEMORY_CONTEXT'],
                keepDuringTruncation: true,
              })
            : false
        let messagesWithStepPrompt = buildArray(
          ...currentAgentState.messageHistory,
          buildCompiledTaskMemoryMessage(currentAgentState),
          stepPrompt &&
            userMessage({
              content: stepPrompt,
            }),
        )

        // Cache system + tools token count once — these don't change between
        // the initial compute and the post-prune recompute (only messages do).
        const systemAndToolsTokens =
          countTokensJson(system) + countTokensJson(toolsForTokenCount)

        const estimateContextTokensLocally = () =>
          countTokensJson(messagesWithStepPrompt) + systemAndToolsTokens

        currentAgentState.contextTokenCount = estimateContextTokensLocally()
        const contextTokensBeforeProgrammatic =
          currentAgentState.contextTokenCount

        // 1. Run programmatic step first if it exists
        let n: number | undefined = undefined
        const historyBeforeProgrammatic = currentAgentState.messageHistory
        const historyTokensBeforeProgrammatic = countTokensJson(
          historyBeforeProgrammatic,
        )
        const categoriesBeforeProgrammatic = getContextCategoryTelemetry(
          historyBeforeProgrammatic,
        )

        if (agentTemplate.handleSteps) {
          const programmaticResult = await runProgrammaticStep({
            ...params,

            agentState: currentAgentState,
            localAgentTemplates,
            nResponses,
            hitStepCap,
            onCostCalculated: async (providerCostCents: number) => {
              currentAgentState.creditsUsed += providerCostCents
              currentAgentState.directCreditsUsed += providerCostCents
            },
            prompt: currentPrompt,
            runId,
            stepNumber: totalSteps,
            stepsComplete: shouldEndTurn,
            system,
            tools,
            template: agentTemplate,
            toolCallParams: currentParams,
          })
          const {
            agentState: programmaticAgentState,
            endTurn,
            stepNumber,
            generateN,
          } = programmaticResult
          n = generateN

          Object.assign(initialAgentState, programmaticAgentState)
          currentAgentState = initialAgentState
          totalSteps = stepNumber

          shouldEndTurn = endTurn

          // nResponses (from a prior GENERATE_N) is consumed by the generator on
          // this step. Clear it so a later programmatic step can't read the same
          // stale responses again.
          nResponses = undefined
        }

        // Programmatic orchestrators (notably Base2) get the first opportunity
        // to run semantic compaction. Rebuild the request from the resulting
        // history before applying the deterministic emergency brake.
        messagesWithStepPrompt = buildArray(
          ...currentAgentState.messageHistory,
          buildCompiledTaskMemoryMessage(currentAgentState),
          stepPrompt &&
            userMessage({
              content: stepPrompt,
            }),
        )
        currentAgentState.contextTokenCount = estimateContextTokensLocally()

        const historyTokensAfterProgrammatic = countTokensJson(
          currentAgentState.messageHistory,
        )
        let compactedThisIteration = false
        const retainedSemanticMemory = currentAgentState.messageHistory.some(
          (message) =>
            Array.isArray(message.content) &&
            message.content.some(
              (part) =>
                part.type === 'text' &&
                /<knowledge_memory>[\s\S]*?<\/knowledge_memory>/.test(
                  part.text,
                ),
            ),
        )
        const semanticBudget = getSemanticCompactionBudget(
          currentAgentState.contextWindowTokens,
        )
        const activeContextLimits = getEffectiveContextLimits(
          currentAgentState.contextWindowTokens,
          maxContextLength,
        )
        const activeMaxContextLength =
          activeContextLimits.providerSafeMessageLimit
        const activeContextWindowForStatus =
          activeContextLimits.statusWindowTokens
        const exceededSemanticTrigger =
          contextTokensBeforeProgrammatic + 1_000 >
          semanticBudget.triggerBudgetTokens
        const hasExplicitMaxContextLength = maxContextLength !== undefined
        if (
          retainedSemanticMemory &&
          historyTokensAfterProgrammatic < historyTokensBeforeProgrammatic &&
          (exceededSemanticTrigger || hasExplicitMaxContextLength)
        ) {
          revokeImplicitReadAuthorizationsAfterCompaction(currentAgentState)
          const categoriesAfterProgrammatic = getContextCategoryTelemetry(
            currentAgentState.messageHistory,
          )
          const removedCategories = (
            Object.keys(categoriesBeforeProgrammatic) as Array<
              keyof typeof categoriesBeforeProgrammatic
            >
          ).filter(
            (category) =>
              categoriesAfterProgrammatic[category].messages <
                categoriesBeforeProgrammatic[category].messages ||
              categoriesAfterProgrammatic[category].tokens <
                categoriesBeforeProgrammatic[category].tokens,
          )
          onResponseChunk({
            type: 'context_compaction',
            action: 'semantic_compaction',
            resolvedContextWindowTokens:
              semanticBudget.resolvedContextWindowTokens,
            triggerBudgetTokens: semanticBudget.triggerBudgetTokens,
            targetBudgetTokens: semanticBudget.targetBudgetTokens,
            reason: exceededSemanticTrigger
              ? 'Total context exceeded the model-aware semantic trigger budget.'
              : 'An explicit maxContextLength override allowed semantic compaction before the model-aware trigger budget.',
            before: {
              tokens: historyTokensBeforeProgrammatic,
              messages: historyBeforeProgrammatic.length,
              categories: categoriesBeforeProgrammatic,
            },
            after: {
              tokens: historyTokensAfterProgrammatic,
              messages: currentAgentState.messageHistory.length,
              categories: categoriesAfterProgrammatic,
            },
            removedCategories,
            retainedKnowledgeMemory: true,
            recovery:
              'Resume from the retained <knowledge_memory> and verify exact live files before editing.',
          })
          compactedThisIteration = true
        }

        // Deterministic trimming is now an emergency brake after semantic
        // compaction, never the first response to context pressure.
        const pruningResult = maybePruneContext({
          messages: currentAgentState.messageHistory,
          systemTokens: systemAndToolsTokens,
          contextTokenCount: currentAgentState.contextTokenCount,
          maxTotalTokens: activeMaxContextLength,
          logger,
        })
        if (pruningResult.pruned) {
          revokeImplicitReadAuthorizationsAfterCompaction(currentAgentState)
          currentAgentState.messageHistory = pruningResult.messages
          messagesWithStepPrompt = buildArray(
            ...pruningResult.messages,
            buildCompiledTaskMemoryMessage(currentAgentState),
            stepPrompt &&
              userMessage({
                content: stepPrompt,
              }),
          )
          currentAgentState.contextTokenCount = estimateContextTokensLocally()
          const report = pruningResult.report!
          onResponseChunk({
            type: 'context_compaction',
            action: 'mechanical_trim',
            resolvedContextWindowTokens: currentAgentState.contextWindowTokens,
            triggerBudgetTokens:
              activeMaxContextLength ?? DEFAULT_MAX_CONTEXT_TOKENS,
            targetBudgetTokens:
              activeMaxContextLength ?? DEFAULT_MAX_CONTEXT_TOKENS,
            reason:
              'Total context remained above the provider-safe request budget after semantic compaction.',
            before: {
              tokens: report.beforeTokens,
              messages: report.beforeMessageCount,
              categories: report.beforeCategories,
            },
            after: {
              tokens: report.afterTokens,
              messages: report.afterMessageCount,
              categories: report.afterCategories,
            },
            removedCategories: report.removedCategories,
            retainedKnowledgeMemory: report.retainedKnowledgeMemory,
            recovery: report.retainedKnowledgeMemory
              ? 'Resume from <knowledge_memory>; re-read exact live files before editing.'
              : 'Re-gather exact constraints, files, and validation evidence before continuing.',
          })
          compactedThisIteration = true
        }

        if (compactedThisIteration) {
          // Persist the compacted operational state before the next provider
          // request. Otherwise a crash between compaction and the normal
          // post-LLM checkpoint can resurrect the pre-compaction transcript or
          // lose the newly synthesized recovery memory.
          maybeCheckpoint(currentAgentState, true)
        }

        onResponseChunk({
          type: 'context_window',
          used: currentAgentState.contextTokenCount,
          max: activeContextWindowForStatus,
        })

        // Check if output is required but missing
        if (
          agentTemplate.outputSchema &&
          // Skip for programmatic agents: the generator (not the model) drives
          // behavior, and restarting the loop here would re-run handleSteps from
          // the top (its generator is torn down once it returns). A userMessage
          // reminder also has no effect on a generator-driven agent.
          !agentTemplate.handleSteps &&
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
          const outputSchemaMessage = withSystemTags(
            `You must use the "set_output" tool to provide a result that matches the output schema before ending your turn. The output schema is required for this agent.`,
          )

          currentAgentState.messageHistory = [
            ...currentAgentState.messageHistory,
            userMessage({
              content: outputSchemaMessage,
              keepDuringTruncation: true,
            }),
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
          hitStepCap: llmHitStepCap,
          messageId,
          nResponses: generatedResponses,
        } = await runAgentStep({
          ...params,

          agentState: currentAgentState,
          agentTemplate,
          n,
          prompt: currentPrompt,
          runId,
          spawnParams: currentParams,
          system,
          tools,
          additionalToolDefinitions: additionalToolDefinitionsWithCache,
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
          logger.error(
            'No runId found for agent state after finishing agent run',
          )
        }

        Object.assign(initialAgentState, newAgentState)
        currentAgentState = initialAgentState
        shouldEndTurn = llmShouldEndTurn
        // Preserve the step-cap flag so the next programmatic-step invocation
        // can forward it to the generator (orchestrators like base2 use it to
        // break out instead of falling through to the gate, which would loop).
        hitStepCap = llmHitStepCap ?? false
        maybeCheckpoint(currentAgentState)
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

      await finishAgentRun({
        ...params,
        runId,
        status: 'completed',
        totalSteps,
        directCredits: currentAgentState.directCreditsUsed,
        totalCredits: currentAgentState.creditsUsed,
      })

      return {
        agentState: currentAgentState,
        output: getAgentOutput(currentAgentState, agentTemplate),
      }
    } catch (error) {
      // Handle user-initiated aborts separately - don't log as errors
      if (isAbortError(error)) {
        if (clearUserPromptMessagesAfterResponse) {
          currentAgentState.messageHistory = expireMessages(
            currentAgentState.messageHistory,
            'userPrompt',
          )
        }

        currentAgentState.messageHistory = [
          ...currentAgentState.messageHistory,
          userMessage(
            withSystemTags(
              "User interrupted the response. The assistant's previous work has been preserved.",
            ),
          ),
        ]

        logger.info(
          {
            agentType,
            agentId: currentAgentState.agentId,
            runId,
            totalSteps,
            messageHistory: currentAgentState.messageHistory,
          },
          'Agent run cancelled by user (abort error)',
        )

        await finishAgentRun({
          ...params,
          runId,
          status: 'cancelled',
          totalSteps,
          directCredits: currentAgentState.directCreditsUsed,
          totalCredits: currentAgentState.creditsUsed,
        })

        return {
          agentState: currentAgentState,
          output: {
            type: 'error',
            message: 'Run cancelled by user',
          },
        }
      }

      logger.error(
        {
          error: getErrorObject(error),
          agentType,
          agentId: currentAgentState.agentId,
          runId,
          totalSteps,
          directCreditsUsed: currentAgentState.directCreditsUsed,
          creditsUsed: currentAgentState.creditsUsed,
          messageHistory: currentAgentState.messageHistory,
          systemPrompt: system,
        },
        'Agent execution failed',
      )

      const apiErrorDetails = extractApiErrorDetails(error)
      const hasServerMessage = apiErrorDetails.message !== undefined
      const fallbackMessage =
        error instanceof Error ? error.message : String(error)
      const errorMessage = apiErrorDetails.message ?? fallbackMessage
      const statusCode = apiErrorDetails.statusCode

      const status = signal.aborted ? 'cancelled' : 'failed'
      await finishAgentRun({
        ...params,
        runId,
        status,
        totalSteps,
        directCredits: currentAgentState.directCreditsUsed,
        totalCredits: currentAgentState.creditsUsed,
        errorMessage,
      })

      // Payment required errors (402) should propagate
      if (statusCode === 402) {
        throw error
      }

      return {
        agentState: currentAgentState,
        output: {
          type: 'error',
          message: hasServerMessage
            ? errorMessage
            : 'Agent run error: ' + errorMessage,
          ...(statusCode !== undefined && { statusCode }),
          ...(apiErrorDetails.errorCode !== undefined && {
            error: apiErrorDetails.errorCode,
          }),
          ...(apiErrorDetails.countryCode !== undefined && {
            countryCode: apiErrorDetails.countryCode,
          }),
          ...(apiErrorDetails.countryBlockReason !== undefined && {
            countryBlockReason: apiErrorDetails.countryBlockReason,
          }),
          ...(apiErrorDetails.ipPrivacySignals !== undefined && {
            ipPrivacySignals: apiErrorDetails.ipPrivacySignals,
          }),
        },
      }
    }
  } finally {
    // Always tear down this run's in-memory programmatic-step state. When a
    // generator yields STEP/STEP_ALL it is intentionally retained across loop
    // iterations; if a later LLM step throws or the run is aborted, control
    // never returns to runProgrammaticStep's own cleanup. Clearing here on
    // every exit path (including a throw during prompt/tool setup) prevents
    // leaking generators/latches and removes the window where
    // a recycled runId could resume a stale generator.
    clearAgentGeneratorForRun(runId)
  }
}

const STEP_CAP_REACHED_MESSAGE = [
  'Agent step limit reached before this turn completed.',
  'Current work and run state were preserved, so the task can resume safely on the next turn.',
  'Increase maxAgentSteps in openbuff.json if this workload routinely needs a larger step budget.',
].join(' ')

/**
 * How many steps before the cap the one-time near-cap checkpoint nudge fires.
 * Compared with `===` against the per-step-decrementing stepsRemaining, so it
 * triggers at most once and only for runs whose budget exceeds this threshold.
 * Unlimited runs never match this threshold; it applies only to configured
 * fixed caps that begin above 30 steps.
 */
const NEAR_STEP_CAP_WARNING_THRESHOLD = 30

const NEAR_STEP_CAP_WARNING_MESSAGE = [
  'Heads up: this turn is approaching its maximum number of agent steps.',
  'If the task is not nearly complete, record the remaining work now with the write_todos tool and bring the current change to a clean, consistent stopping point — no half-applied edits.',
  'Your todos and run state are persisted, so the user can resume on the next turn. The cap is configurable via maxAgentSteps in openbuff.json.',
].join(' ')

const NEAR_STEP_CAP_WARNING_MESSAGE_NO_WRITE_TODOS = [
  'Heads up: this turn is approaching its maximum number of agent steps.',
  'If the task is not nearly complete, bring the current change to a clean, consistent stopping point — no half-applied edits.',
  'When you stop, the user can resume on the next turn. The cap is configurable via maxAgentSteps in openbuff.json.',
].join(' ')
