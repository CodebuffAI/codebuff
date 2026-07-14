import { jsonToolResult } from '@codebuff/common/util/messages'
import { MAX_SPAWN_BATCH_SIZE } from '@codebuff/common/constants/agents'

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
  deriveSpawnTemplateCapabilities,
  validateVersionedAgentHandoff,
  normalizeSpawnedAgentOutput,
  buildRuntimeAgentReceipt,
  reconcileAgentReceiptIntoParent,
  createCombinedAbortSignal,
} from './spawn-agent-utils'
import { appendOrchestrationEvent } from '../../../util/orchestration-ledger'
import { selectAgentAttempt } from '../../../orchestration/select-agent-attempt'
import {
  acquireWorkspacePathLease,
  releaseWorkspacePathLease,
} from '../../../util/workspace-path-leases'
import {
  claimDiscoveryShard,
  completeDiscoveryShard,
} from '../../../orchestration/discovery-coordinator'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { AgentHandoff } from '@codebuff/common/types/agent-handoff'
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
type ValidatedSpawnAgent = {
  spawnIndex: number
  input: SpawnAgentInput
  agentTemplate: AgentTemplate
  agentType: string
  runtimeSpawnParams: Record<string, unknown> | undefined
  subAgentState: AgentState
  capabilityId: string
  schedulingReasons: string[]
  leaseId?: string
  discoveryShardKey?: string
  handoff?: AgentHandoff
}

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

  if (agents.length > MAX_SPAWN_BATCH_SIZE) {
    throw new Error(
      `spawn_agents accepts at most ${MAX_SPAWN_BATCH_SIZE} agents per call; received ${agents.length}. Split the work into bounded waves.`,
    )
  }

  // Validate the complete batch before launching any detached work. Without
  // this preflight, an invalid later entry could throw after earlier
  // background agents had started but before their job ids were returned.
  const validatedAgents: ValidatedSpawnAgent[] = await Promise.all(
    agents.map(async (input, spawnIndex) => {
      const {
        agent_type: agentTypeStr,
        prompt,
        params: spawnParams,
        handoff,
      } = input
      const { agentTemplate, agentType } = await validateAndGetAgentTemplate({
        ...params,
        agentTypeStr,
        parentAgentTemplate,
      })
      validateAgentInput(agentTemplate, agentType, prompt, spawnParams)
      validateVersionedAgentHandoff({ agentType, handoff })
      const canonicalHandoff =
        handoff &&
        typeof handoff === 'object' &&
        handoff.schemaVersion === 1
          ? (handoff as AgentHandoff)
          : undefined
      const effectiveAgentTemplate = deriveSpawnTemplateCapabilities({
        agentTemplate,
        handoff: canonicalHandoff,
        projectRoot: params.fileContext.projectRoot,
      })
      const serializedHandoff = handoff ? JSON.stringify(handoff) : ''
      const selection = selectAgentAttempt({
        candidates: [
          {
            template: effectiveAgentTemplate,
            contextWindowTokens: params.resolveModelContextWindow?.({
              agentId: effectiveAgentTemplate.id,
              model: effectiveAgentTemplate.model,
            }),
            explicitRoute: true,
          },
        ],
        requiredTools: canonicalHandoff?.permissions.allowedTools ?? [],
        requiredWritablePaths:
          canonicalHandoff?.permissions.writablePaths ?? [],
        minimumContextTokens: Math.max(
          2_048,
          Math.ceil((serializedHandoff.length + (prompt?.length ?? 0)) / 2),
        ),
        runningForRoot:
          parentAgentState.backgroundAgentJobs?.filter(
            (job) => job.status === 'running',
          ).length ?? 0,
        maxRunningForRoot: 8,
      })
      const runtimeSpawnParams = buildSpawnParamsWithHandoff({
        agentType,
        handoff,
        spawnParams,
      }) as Record<string, unknown> | undefined
      return {
        spawnIndex,
        input,
        agentTemplate: selection.candidate.template,
        agentType,
        runtimeSpawnParams,
        capabilityId: selection.capabilityId,
        schedulingReasons: selection.reasons,
        handoff: canonicalHandoff,
        subAgentState: createAgentState(
          agentType,
          selection.candidate.template,
          parentAgentState,
          {},
        ),
      }
    }),
  )

  // Background agents are launched detached: their executeSubagent promise is
  // not awaited, the coroutine runs as a fire-and-forget same-process job, and
  // spawn_agents returns immediately with a per-agent jobId report. The parent
  // polls progress via check_background_agent. Only foreground (blocking)
  // agents go through the Promise.allSettled aggregation path.
  const reports: Array<SpawnAgentReport | undefined> = new Array(
    validatedAgents.length,
  )
  for (const validated of validatedAgents) {
    if (
      validated.agentType === 'file-picker' ||
      validated.agentType === 'code-searcher' ||
      validated.agentType === 'file-lister'
    ) {
      const claimed = claimDiscoveryShard({
        existing: parentAgentState.discoveryCoverage,
        agentType: validated.agentType,
        question: validated.input.prompt ?? validated.handoff?.objective ?? '',
        workspaceRevision: parentAgentState.workspaceState?.revision,
      })
      parentAgentState.discoveryCoverage = claimed.state
      validated.discoveryShardKey = claimed.shardKey
    }
  }
  try {
    for (const validated of validatedAgents) {
      validated.leaseId = acquireWorkspacePathLease({
        state: parentAgentState,
        projectRoot: params.fileContext.projectRoot,
        ownerAgentId: validated.subAgentState.agentId,
        taskId: validated.handoff?.taskId,
        paths: validated.handoff?.permissions.writablePaths ?? [],
      })
    }
  } catch (error) {
    for (const validated of validatedAgents) {
      releaseWorkspacePathLease(parentAgentState, validated.leaseId)
    }
    throw error
  }
  for (const validated of validatedAgents) {
    appendOrchestrationEvent({
      state: parentAgentState,
      event: {
        type: 'spawn_started',
        runId: parentAgentState.runId ?? parentAgentState.agentId,
        spawnId: validated.subAgentState.agentId,
        taskId: validated.handoff?.taskId,
        agentType: validated.agentType,
        parentRunId: parentAgentState.runId ?? parentAgentState.agentId,
        capabilityId: validated.capabilityId,
        workspaceRevision: parentAgentState.workspaceState?.revision,
        workspaceSnapshotId: parentAgentState.workspaceState?.snapshotId,
      },
    })
  }
  for (const validated of validatedAgents) {
    if (!validated.input.background) continue
    const {
      agentTemplate,
      agentType,
      runtimeSpawnParams,
      subAgentState,
      spawnIndex,
    } = validated
    const { prompt, timeout_seconds } = validated.input

    const contextParams = extractSubagentContextParams(params)

    // Pre-allocate the jobId so executeSubagent's synchronous
    // onResponseChunk(startEvent) callback has a valid jobId to buffer into.
    // executeSubagent fires the start event before it even returns the
    // coroutine promise, so we cannot register-after-allocate here.
    const job = allocateBackgroundAgentJob({
      agentType,
      agentName: agentTemplate.displayName,
      owner: {
        clientSessionId: params.clientSessionId,
        rootRunId:
          parentAgentState.ancestorRunIds[0] ??
          parentAgentState.runId ??
          parentAgentState.agentId,
        parentRunId: parentAgentState.runId ?? parentAgentState.agentId,
        parentAgentId: parentAgentState.agentId,
        userInputId,
      },
    })
    const backgroundSignal = contextParams.signal
      ? createCombinedAbortSignal(
          contextParams.signal,
          job.abortController.signal,
        )
      : job.abortController.signal
    parentAgentState.backgroundAgentJobs ??= []
    parentAgentState.backgroundAgentJobs.push({
      jobId: job.jobId,
      agentType,
      status: 'running',
      startedAt: job.startedAt,
    })

    // Detached coroutine: do NOT await. The registry tracks lifecycle and
    // buffers streamed chunks for check_background_agent to poll.
    const detachedPromise = executeSubagent({
      ...contextParams,
      signal: backgroundSignal,
      ancestorRunIds: parentAgentState.ancestorRunIds,
      userInputId: `${userInputId}-${agentType}${subAgentState.agentId}`,
      prompt: prompt || '',
      spawnParams: runtimeSpawnParams,
      agentTemplate,
      parentAgentState,
      agentState: subAgentState,
      fingerprintId,
      spawnToolCallId: toolCall.toolCallId,
      spawnIndex,
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

    attachBackgroundAgentPromise(
      job,
      detachedPromise.then((result) => {
        const receipt = buildRuntimeAgentReceipt({
          agentType,
          agentId: result.agentState.agentId,
          handoff: validated.handoff,
          output: result.output,
          agentState: result.agentState,
        })
        reconcileAgentReceiptIntoParent({
          parentAgentState,
          receipt,
          agentType,
          objective: validated.handoff?.objective,
        })
        const intent = parentAgentState.backgroundAgentJobs?.find(
          (entry) => entry.jobId === job.jobId,
        )
        if (intent) {
          intent.status = 'completed'
          intent.completedAt = Date.now()
          intent.childRunId = result.agentState.runId
          intent.receipt = receipt
        }
        releaseWorkspacePathLease(parentAgentState, validated.leaseId)
        parentAgentState.discoveryCoverage = completeDiscoveryShard({
          existing: parentAgentState.discoveryCoverage,
          shardKey: validated.discoveryShardKey,
          status: 'completed',
        })
        return {
          agentId: result.agentState.agentId,
          agentName: agentTemplate.displayName,
          agentType,
          output: normalizeSpawnedAgentOutput(result.output, agentType),
          agentReceipt: receipt,
          creditsUsed: result.agentState.creditsUsed || 0,
        }
      }).catch((error) => {
        const receipt = buildRuntimeAgentReceipt({
          agentType,
          agentId: subAgentState.agentId,
          handoff: validated.handoff,
          output: undefined,
          agentState: subAgentState,
          status: 'failed',
          error,
        })
        reconcileAgentReceiptIntoParent({
          parentAgentState,
          receipt,
          agentType,
          objective: validated.handoff?.objective,
        })
        const intent = parentAgentState.backgroundAgentJobs?.find(
          (entry) => entry.jobId === job.jobId,
        )
        if (intent) {
          intent.status = 'error'
          intent.completedAt = Date.now()
          intent.error = error instanceof Error ? error.message : String(error)
          intent.receipt = receipt
        }
        releaseWorkspacePathLease(parentAgentState, validated.leaseId)
        parentAgentState.discoveryCoverage = completeDiscoveryShard({
          existing: parentAgentState.discoveryCoverage,
          shardKey: validated.discoveryShardKey,
          status: 'failed',
        })
        throw error
      }),
    )

    reports[spawnIndex] = {
      agentId: subAgentState.agentId,
      agentName: agentTemplate.displayName,
      agentType,
      value: {
        background: true,
        jobId: job.jobId,
        message: `Agent launched in background. Poll progress with check_background_agent({ jobId: "${job.jobId}" }).`,
      } as JSONValue,
    }
  }

  const foregroundAgents = validatedAgents.filter(
    (entry) => !entry.input.background,
  )
  const results = await Promise.allSettled(
    foregroundAgents.map(
      async ({
        input,
        agentTemplate,
        agentType,
        runtimeSpawnParams,
        subAgentState,
        spawnIndex,
      }) => {
        const { prompt, timeout_seconds } = input

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
          spawnToolCallId: toolCall.toolCallId,
          spawnIndex,
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

  await Promise.all(
    results.map(async (result, index): Promise<void> => {
      const spawnIndex = foregroundAgents[index].spawnIndex
      if (result.status === 'fulfilled') {
        const { output, agentType, agentName, agentState } = result.value
        const handoff = foregroundAgents[index].handoff
        const receipt = buildRuntimeAgentReceipt({
          agentType,
          agentId: agentState.agentId,
          handoff,
          output,
          agentState,
        })
        reconcileAgentReceiptIntoParent({
          parentAgentState,
          receipt,
          agentType,
          objective: handoff?.objective,
        })
        reports[spawnIndex] = {
          agentId: agentState.agentId,
          agentName,
          agentType,
          value: normalizeSpawnedAgentOutput(output, agentType) as JSONValue,
          agentReceipt: receipt as unknown as JSONValue,
        }
      } else {
        const agentTypeStr = foregroundAgents[index].input.agent_type
        const handoff = foregroundAgents[index].handoff
        const receipt = buildRuntimeAgentReceipt({
          agentType: agentTypeStr,
          agentId: foregroundAgents[index].subAgentState.agentId,
          handoff,
          output: undefined,
          agentState: foregroundAgents[index].subAgentState,
          status: 'failed',
          error: result.reason,
        })
        reconcileAgentReceiptIntoParent({
          parentAgentState,
          receipt,
          agentType: agentTypeStr,
          objective: handoff?.objective,
        })
        reports[spawnIndex] = {
          agentType: agentTypeStr,
          agentName: agentTypeStr,
          value: { errorMessage: `Error spawning agent: ${result.reason}` },
          agentReceipt: receipt as unknown as JSONValue,
        }
      }
      releaseWorkspacePathLease(
        parentAgentState,
        foregroundAgents[index].leaseId,
      )
      parentAgentState.discoveryCoverage = completeDiscoveryShard({
        existing: parentAgentState.discoveryCoverage,
        shardKey: foregroundAgents[index].discoveryShardKey,
        status: result.status === 'fulfilled' ? 'completed' : 'failed',
      })
    }),
  )

  // Aggregate costs from subagents (foreground only; background agent costs
  // are accumulated into their own AgentState and surfaced on poll).
  results.forEach((result, index) => {
    const agentInfo = foregroundAgents[index].input
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

  return {
    output: jsonToolResult(
      reports.map(
        (report, index) =>
          report ?? {
            agentType: validatedAgents[index].agentType,
            agentName: validatedAgents[index].agentTemplate.displayName,
            value: { errorMessage: 'Agent did not produce a spawn report.' },
          },
      ),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>
