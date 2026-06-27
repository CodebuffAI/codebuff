import { jsonToolResult } from '@codebuff/common/util/messages'

import {
  allocateBackgroundAgentJob,
  appendBackgroundAgentChunk,
  attachBackgroundAgentPromise,
} from '../../../util/background-agent-jobs'

import {
  validateAndGetAgentTemplate,
  validateAgentInput,
  createAgentState,
  executeSubagent,
  extractSubagentContextParams,
  buildSpawnParamsWithHandoff,
} from './spawn-agent-utils'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { JSONObject, JSONValue } from '@codebuff/common/types/json'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ToolSet } from 'ai'

export type SendSubagentChunk = (data: {
  userInputId: string
  agentId: string
  agentType: string
  chunk: string
  prompt?: string
  forwardToPrompt?: boolean
}) => void

type ToolName = 'spawn_agents'
type SpawnAgentReport = { agentType: string } & JSONObject
type SpawnAgentInput = CodebuffToolCall<ToolName>['input']['agents'][number]

export const handleSpawnAgents = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    agentState: AgentState
    agentTemplate: AgentTemplate
    fingerprintId: string
    localAgentTemplates: Record<string, AgentTemplate>
    logger: Logger
    system: string
    tools?: ToolSet
    userId: string | undefined
    userInputId: string
    sendSubagentChunk: SendSubagentChunk
    writeToClient: (chunk: string | PrintModeEvent) => void
  } & ParamsExcluding<
    typeof validateAndGetAgentTemplate,
    'agentTypeStr' | 'parentAgentTemplate'
  > &
    ParamsExcluding<
      typeof executeSubagent,
      | 'userInputId'
      | 'prompt'
      | 'spawnParams'
      | 'agentTemplate'
      | 'parentAgentState'
      | 'agentState'
      | 'fingerprintId'
      | 'isOnlyChild'
      | 'parentSystemPrompt'
      | 'parentTools'
      | 'onResponseChunk'
    >,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,

    agentState: parentAgentState,
    agentTemplate: parentAgentTemplate,
    fingerprintId,
    system: parentSystemPrompt,
    tools: parentTools = {},
    userInputId,
    sendSubagentChunk,
    writeToClient,
  } = params
  const { agents } = toolCall.input
  const { logger } = params

  await previousToolCallFinished

  // Background agents are launched detached: their executeSubagent promise is
  // not awaited, the coroutine runs as a fire-and-forget same-process job, and
  // spawn_agents returns immediately with a per-agent jobId report. The parent
  // polls progress via check_background_agent. Only foreground (blocking)
  // agents go through the Promise.allSettled aggregation path.
  const backgroundReports: SpawnAgentReport[] = []
  for (const {
    agent_type: agentTypeStr,
    prompt,
    params: spawnParams,
    handoff,
    background,
    timeout_seconds,
  } of agents) {
    if (!background) continue

    const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
      ...params,
      agentTypeStr,
      parentAgentTemplate,
    })

    validateAgentInput(agentTemplate, agentType, prompt, spawnParams)
    const runtimeSpawnParams = buildSpawnParamsWithHandoff({
      agentType,
      handoff,
      spawnParams,
    })

    const subAgentState = createAgentState(
      agentType,
      agentTemplate,
      parentAgentState,
      {},
    )

    const contextParams = extractSubagentContextParams(params)

    // Pre-allocate the jobId so executeSubagent's synchronous
    // onResponseChunk(startEvent) callback has a valid jobId to buffer into.
    // executeSubagent fires the start event before it even returns the
    // coroutine promise, so we cannot register-after-allocate here.
    const job = allocateBackgroundAgentJob({
      agentType,
      agentName: agentTemplate.displayName,
    })

    // Detached coroutine: do NOT await. The registry tracks lifecycle and
    // buffers streamed chunks for check_background_agent to poll.
    const detachedPromise = executeSubagent({
      ...contextParams,
      ancestorRunIds: parentAgentState.ancestorRunIds,
      userInputId: `${userInputId}-${agentType}${subAgentState.agentId}`,
      prompt: prompt || '',
      spawnParams: runtimeSpawnParams,
      agentTemplate,
      parentAgentState,
      agentState: subAgentState,
      fingerprintId,
      // Per-spawn wall-clock override (seconds → ms; -1 → no timeout).
      subagentTimeoutMs:
        timeout_seconds === undefined ? undefined : timeout_seconds * 1000,
      // Background agents are detached; the parent never waits for them, so
      // the "only child" step-count semantics (tuned for blocking spawns the
      // parent blocks on) never apply. Force false regardless of how many
      // agents are in the batch.
      isOnlyChild: false,
      excludeToolFromMessageHistory: false,
      fromHandleSteps: false,
      parentSystemPrompt,
      parentTools: agentTemplate.inheritParentSystemPrompt
        ? parentTools
        : undefined,
      onResponseChunk: (chunk: string | PrintModeEvent) => {
        // Buffer the chunk for polling. We do NOT forward background agent
        // chunks to writeToClient/sendSubagentChunk because the parent has
        // already moved past this tool call — surfacing interleaved output
        // would confuse the active turn.
        if (typeof chunk === 'string') {
          appendBackgroundAgentChunk(job.jobId, {
            type: 'text',
            payload: chunk,
            timestamp: Date.now(),
          })
          return
        }
        appendBackgroundAgentChunk(job.jobId, {
          type: chunk.type,
          payload: chunk,
          timestamp: Date.now(),
        })
      },
    })

    attachBackgroundAgentPromise(job, detachedPromise as Promise<unknown>)

    backgroundReports.push({
      agentId: subAgentState.agentId,
      agentName: agentTemplate.displayName,
      agentType,
      value: {
        background: true,
        jobId: job.jobId,
        message: `Agent launched in background. Poll progress with check_background_agent({ jobId: "${job.jobId}" }).`,
      } as JSONValue,
    })
  }

  const foregroundAgents = agents.filter((entry) => !entry.background)
  const results = await Promise.allSettled(
    foregroundAgents.map(
      async ({
        agent_type: agentTypeStr,
        prompt,
        params: spawnParams,
        handoff,
        timeout_seconds,
      }) => {
        const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
          ...params,
          agentTypeStr,
          parentAgentTemplate,
        })

        validateAgentInput(agentTemplate, agentType, prompt, spawnParams)
        const runtimeSpawnParams = buildSpawnParamsWithHandoff({
          agentType,
          handoff,
          spawnParams,
        })

        const subAgentState = createAgentState(
          agentType,
          agentTemplate,
          parentAgentState,
          {},
        )

        // Extract common context params to avoid bugs from spreading all params
        const contextParams = extractSubagentContextParams(params)

        const result = await executeSubagent({
          ...contextParams,

          // Spawn-specific params
          ancestorRunIds: parentAgentState.ancestorRunIds,
          userInputId: `${userInputId}-${agentType}${subAgentState.agentId}`,
          prompt: prompt || '',
          spawnParams: runtimeSpawnParams,
          agentTemplate,
          parentAgentState,
          agentState: subAgentState,
          fingerprintId,
          isOnlyChild: foregroundAgents.length === 1,
          // Per-spawn wall-clock override (seconds → ms; -1 → no timeout).
          subagentTimeoutMs:
            timeout_seconds === undefined ? undefined : timeout_seconds * 1000,
          excludeToolFromMessageHistory: false,
          fromHandleSteps: false,
          parentSystemPrompt,
          parentTools: agentTemplate.inheritParentSystemPrompt
            ? parentTools
            : undefined,
          onResponseChunk: (chunk: string | PrintModeEvent) => {
            if (typeof chunk === 'string') {
              sendSubagentChunk({
                userInputId,
                agentId: subAgentState.agentId,
                agentType,
                chunk,
                prompt,
              })
              return
            }

            if (chunk.type === 'text') {
              if (chunk.text) {
                writeToClient({
                  type: 'text' as const,
                  agentId: subAgentState.agentId,
                  text: chunk.text,
                })
              }
              return
            }

            // Add parentAgentId for proper nesting in UI
            const ensureParentAgentId = () => {
              if (
                chunk.type === 'subagent_start' ||
                chunk.type === 'subagent_finish'
              ) {
                return (
                  chunk.parentAgentId ??
                  subAgentState.parentId ??
                  parentAgentState?.agentId
                )
              }
              if (chunk.type === 'tool_call' || chunk.type === 'tool_result') {
                return (chunk as any).parentAgentId ?? subAgentState.agentId
              }
              return undefined
            }

            const parentAgentId = ensureParentAgentId()
            if (
              parentAgentId !== undefined &&
              (chunk.type === 'subagent_start' ||
                chunk.type === 'subagent_finish' ||
                chunk.type === 'tool_call' ||
                chunk.type === 'tool_result')
            ) {
              writeToClient({ ...chunk, parentAgentId })
              return
            }

            const eventWithAgent = {
              ...chunk,
              agentId: subAgentState.agentId,
            }
            writeToClient(eventWithAgent)
          },
        })
        return { ...result, agentType, agentName: agentTemplate.displayName }
      },
    ),
  )

  const reports: SpawnAgentReport[] = [
    ...backgroundReports,
    ...(await Promise.all(
      results.map(async (result, index): Promise<SpawnAgentReport> => {
        if (result.status === 'fulfilled') {
          const { output, agentType, agentName, agentState } = result.value
          return {
            agentId: agentState.agentId,
            agentName,
            agentType,
            value: normalizeSpawnedAgentOutput(output) as JSONValue,
          }
        } else {
          const agentTypeStr = foregroundAgents[index].agent_type
          return {
            agentType: agentTypeStr,
            agentName: agentTypeStr,
            value: { errorMessage: `Error spawning agent: ${result.reason}` },
          }
        }
      }),
    )),
  ]

  // Aggregate costs from subagents (foreground only; background agent costs
  // are accumulated into their own AgentState and surfaced on poll).
  results.forEach((result, index) => {
    const agentInfo = foregroundAgents[index]
    let subAgentCredits = 0

    if (result.status === 'fulfilled') {
      subAgentCredits = result.value.agentState.creditsUsed || 0
      // Note (James): Try not to include frequent logs with narrow debugging value.
      // logger.debug(
      //   {
      //     parentAgentId: validatedState.agentState.agentId,
      //     subAgentType: agentInfo.agent_type,
      //     subAgentCredits,
      //   },
      //   'Aggregating successful subagent cost',
      // )
    } else if (result.reason?.agentState?.creditsUsed) {
      // Even failed agents may have incurred partial costs
      subAgentCredits = result.reason.agentState.creditsUsed || 0
      logger.debug(
        {
          parentAgentId: parentAgentState.agentId,
          subAgentType: agentInfo.agent_type,
          subAgentCredits,
        },
        'Aggregating failed subagent partial cost',
      )
    }

    if (subAgentCredits > 0) {
      parentAgentState.creditsUsed += subAgentCredits
      // Note (James): Try not to include frequent logs with narrow debugging value.
      // logger.debug(
      //   {
      //     parentAgentId: validatedState.agentState.agentId,
      //     addedCredits: subAgentCredits,
      //     totalCredits: validatedState.agentState.creditsUsed,
      //   },
      //   'Updated parent agent total cost',
      // )
    }
  })

  return { output: jsonToolResult(reports) }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function normalizeSpawnedAgentOutput(output: any): any {
  if (
    output &&
    typeof output === 'object' &&
    !Array.isArray(output) &&
    (output as Record<string, unknown>).type === 'error'
  ) {
    const message = (output as Record<string, unknown>).message
    return {
      errorMessage:
        typeof message === 'string' && message.trim()
          ? message
          : 'Subagent failed before producing output',
    }
  }

  return output
}
