import { isDeepStrictEqual } from 'node:util'
import { match } from 'ts-pattern'

import {
  appendTextToRootStream,
  appendToolToAgentBlock,
  closeNativeReasoningBlock,
  closeNativeReasoningInAgent,
  markAgentComplete,
  markAgentFailed,
} from './block-operations'
import {
  getCanonicalMutationResult,
  hasMultipartError,
  isTerminalToolBlock,
} from './tool-result-normalizer'
import { shouldHideAgent } from './constants'
import {
  createAgentBlock,
  extractPlanFromBuffer,
  extractSpawnAgentResultContent,
  findAgentTypeById,
  insertPlanBlock,
  nestBlockUnderParent,
  transformAskUserBlocks,
  updateBlocksRecursively,
  updateToolBlockWithOutput,
} from './message-block-helpers'
import {
  extractDiff,
  extractFilePath,
  getImplementorDisplayName,
  isEditToolBlock,
  isImplementorAgent,
} from './implementor-helpers'
import {
  findMatchingSpawnAgent,
  resolveSpawnAgentToReal,
} from './spawn-agent-matcher'
import {
  destinationFromChunkEvent,
  processTextChunk,
} from './stream-chunk-processor'
import {
  computeCompletionSummary,
  formatCompletionSummary,
} from './completion-summary'

import type { AgentMode } from './constants'
import type { MessageUpdater } from './message-updater'
import type { StreamController } from '../hooks/stream-state'
import type { StreamStatus } from '../hooks/use-message-queue'
import type {
  AgentContentBlock,
  ContentBlock,
  ToolContentBlock,
} from '../types/chat'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  PrintModeContextWindow,
  PrintModeContextCompaction,
  PrintModeEvent as SDKEvent,
  PrintModeFinish,
  PrintModePhase,
  PrintModeSubagentFinish,
  PrintModeSubagentStart,
  PrintModeToolCall,
  PrintModeToolResult,
  PrintModeToolStart,
} from '@codebuff/common/types/print-mode'
import type { ToolName } from '@openbuff/sdk'
import type { MutableRefObject } from 'react'

export type SetStreamingAgentsFn = (
  updater: (prev: Set<string>) => Set<string>,
) => void

export type SetStreamStatusFn = (status: StreamStatus) => void

export type SetContextWindowUsageFn = (
  usage: { used: number; max: number } | null,
) => void

export type StreamChunkEvent =
  | string
  | {
      type: 'subagent_chunk'
      agentId: string
      agentType: string
      chunk: string
    }
  | {
      type: 'reasoning_chunk'
      agentId: string
      ancestorRunIds: string[]
      chunk: string
    }

export type StreamingState = {
  streamRefs: StreamController
  setStreamingAgents: SetStreamingAgentsFn
  setStreamStatus: SetStreamStatusFn
  setContextWindowUsage: SetContextWindowUsageFn
}

export type MessageState = {
  aiMessageId: string
  updater: MessageUpdater
  hasReceivedContentRef: MutableRefObject<boolean>
}

export type SubagentState = {
  addActiveSubagent: (id: string, agentType?: string) => void
  removeActiveSubagent: (id: string) => void
}

export type ModeState = {
  agentMode: AgentMode
  setHasReceivedPlanResponse: (value: boolean) => void
}

export type EventHandlerState = {
  streaming: StreamingState
  message: MessageState
  subagents: SubagentState
  mode: ModeState
  logger: Logger
  setIsRetrying: (retrying: boolean) => void
  onTotalCost?: (cost: number) => void
}

type TextDelta = { type: 'text' | 'reasoning'; text: string }

const hiddenToolNames = new Set<ToolName | 'spawn_agent_inline'>([
  'spawn_agent_inline',
  'end_turn',
  'spawn_agents',
])

const isHiddenToolName = (
  toolName: string,
): toolName is ToolName | 'spawn_agent_inline' =>
  hiddenToolNames.has(toolName as ToolName | 'spawn_agent_inline')

const ensureStreaming = (state: EventHandlerState) => {
  if (!state.message.hasReceivedContentRef.current) {
    state.message.hasReceivedContentRef.current = true
    state.streaming.setStreamStatus('streaming')
    state.setIsRetrying(false)
  }
}

const appendRootChunk = (state: EventHandlerState, delta: TextDelta) => {
  if (!delta.text) {
    return
  }

  state.message.updater.updateAiMessageBlocks((blocks) =>
    appendTextToRootStream(blocks, delta),
  )

  if (
    state.mode.agentMode === 'PLAN' &&
    delta.type === 'text' &&
    !state.streaming.streamRefs.state.planExtracted
  ) {
    const currentBuffer = `${state.streaming.streamRefs.state.rootStreamBuffer}${delta.text}`
    const rawPlan = extractPlanFromBuffer(currentBuffer)
    if (rawPlan !== null) {
      state.streaming.streamRefs.setters.setPlanExtracted(true)
      state.mode.setHasReceivedPlanResponse(true)
      state.message.updater.updateAiMessageBlocks((blocks) =>
        insertPlanBlock(blocks, rawPlan),
      )
    }
  }
}

const updateStreamingAgents = (
  state: EventHandlerState,
  op: { add?: string; remove?: string },
) => {
  state.streaming.setStreamingAgents((prev) => {
    const next = new Set(prev)
    if (op.remove) {
      next.delete(op.remove)
    }
    if (op.add) {
      next.add(op.add)
    }
    return next
  })
}

const handleSubagentStart = (
  state: EventHandlerState,
  event: PrintModeSubagentStart,
) => {
  if (shouldHideAgent(event.agentType)) {
    return
  }

  state.subagents.addActiveSubagent(event.agentId, event.agentType)

  const spawnAgentMatch = findMatchingSpawnAgent(
    state.streaming.streamRefs.state.spawnAgentsMap,
    event.agentType || '',
    event.spawnToolCallId,
    event.spawnIndex,
  )

  if (spawnAgentMatch) {
    state.message.updater.updateAiMessageBlocks((blocks) =>
      resolveSpawnAgentToReal({
        blocks,
        match: spawnAgentMatch,
        realAgentId: event.agentId,
        realAgentType: event.agentType,
        parentAgentId: event.parentAgentId,
        params: event.params,
        prompt: event.prompt,
      }),
    )

    updateStreamingAgents(state, {
      remove: spawnAgentMatch.tempId,
      add: event.agentId,
    })
    state.streaming.streamRefs.setters.removeSpawnAgentInfo(
      spawnAgentMatch.tempId,
    )
    return
  }

  state.logger.info(
    {
      agentId: event.agentId,
      agentType: event.agentType,
      parentAgentId: event.parentAgentId || 'ROOT',
    },
    'Creating new agent block (no spawn_agents match)',
  )

  state.message.updater.updateAiMessageBlocks((blocks) => {
    // Look up the parent agent's type if there's a parent agent ID
    const parentAgentType = event.parentAgentId
      ? findAgentTypeById(blocks, event.parentAgentId)
      : undefined

    const newAgentBlock = createAgentBlock({
      agentId: event.agentId,
      agentType: event.agentType || '',
      prompt: event.prompt,
      params: event.params,
      parentAgentType,
    })

    if (event.parentAgentId) {
      const { blocks: nestedBlocks, parentFound } = nestBlockUnderParent(
        blocks,
        event.parentAgentId,
        newAgentBlock,
      )
      if (parentFound) {
        return nestedBlocks
      }
    }
    return [...blocks, newAgentBlock]
  })

  updateStreamingAgents(state, { add: event.agentId })
}

const handleSubagentFinish = (
  state: EventHandlerState,
  event: PrintModeSubagentFinish,
) => {
  if (shouldHideAgent(event.agentType)) {
    return
  }

  state.streaming.streamRefs.setters.removeAgentAccumulator(event.agentId)
  state.subagents.removeActiveSubagent(event.agentId)

  const unresolvedToolIds = new Set<string>()
  state.message.updater.updateAiMessageBlocks((blocks) => {
    if (event.error) {
      collectUnresolvedToolIdsForAgent(blocks, event.agentId, unresolvedToolIds)
      return markAgentFailed(blocks, event.agentId, event.error)
    }
    return markAgentComplete(blocks, event.agentId)
  })

  updateStreamingAgents(state, { remove: event.agentId })
  for (const toolCallId of unresolvedToolIds) {
    updateStreamingAgents(state, { remove: toolCallId })
  }
}

const collectUnresolvedToolIds = (
  blocks: ContentBlock[],
  out: Set<string>,
): void => {
  for (const block of blocks) {
    if (block.type === 'tool') {
      if (!isTerminalToolBlock(block) && block.outputRaw === undefined) {
        out.add(block.toolCallId)
      }
    } else if (block.type === 'agent' && block.blocks) {
      collectUnresolvedToolIds(block.blocks, out)
    }
  }
}

const collectUnresolvedToolIdsForAgent = (
  blocks: ContentBlock[],
  agentId: string,
  out: Set<string>,
): void => {
  for (const block of blocks) {
    if (block.type !== 'agent') continue
    if (block.agentId === agentId) {
      collectUnresolvedToolIds(block.blocks ?? [], out)
      return
    }
    if (block.blocks) {
      collectUnresolvedToolIdsForAgent(block.blocks, agentId, out)
    }
  }
}

const handleSpawnAgentsToolCall = (
  state: EventHandlerState,
  event: PrintModeToolCall,
) => {
  const agents = Array.isArray(event.input?.agents) ? event.input?.agents : []

  agents.forEach((agent: any, index: number) => {
    const tempAgentId = `${event.toolCallId}-${index}`
    state.streaming.streamRefs.setters.setSpawnAgentInfo(tempAgentId, {
      index,
      agentType: agent.agent_type || 'unknown',
    })
  })

  state.message.updater.updateAiMessageBlocks((blocks) => {
    // Look up the parent agent's type if there's a parent agent ID
    const parentAgentType = event.agentId
      ? findAgentTypeById(blocks, event.agentId)
      : undefined

    const newAgentBlocks: ContentBlock[] = agents
      .map((agent: any, originalIndex: number) => ({ agent, originalIndex }))
      .filter(({ agent }) => !shouldHideAgent(agent.agent_type || ''))
      .map(({ agent, originalIndex }) =>
        createAgentBlock({
          agentId: `${event.toolCallId}-${originalIndex}`,
          agentType: agent.agent_type || '',
          prompt: agent.prompt,
          params: agent.params,
          spawnToolCallId: event.toolCallId,
          spawnIndex: originalIndex,
          parentAgentType,
        }),
      )

    return [...blocks, ...newAgentBlocks]
  })

  agents.forEach((_: any, index: number) => {
    updateStreamingAgents(state, { add: `${event.toolCallId}-${index}` })
  })
}

const handleRegularToolCall = (
  state: EventHandlerState,
  event: PrintModeToolCall,
) => {
  const newToolBlock: ToolContentBlock = {
    type: 'tool',
    toolCallId: event.toolCallId,
    toolName: event.toolName as ToolName,
    input: event.input,
    agentId: event.agentId,
    ...(event.includeToolCall !== undefined && {
      includeToolCall: event.includeToolCall,
    }),
    // Carry the `queued` signal so the UI can distinguish a write that is
    // waiting on a prior same-path write (queued) from one that is actively
    // running but has no result yet (pending). Omitted when not queued.
    ...(event.queued !== undefined && { queued: event.queued }),
    lifecycle: event.queued === true ? 'queued' : 'running',
  }

  if (event.parentAgentId && event.agentId) {
    state.message.updater.updateAiMessageBlocks((blocks) =>
      appendToolToAgentBlock(blocks, event.agentId as string, newToolBlock),
    )
    return
  }

  state.message.updater.updateAiMessageBlocks((blocks) => [
    ...blocks,
    newToolBlock,
  ])
}

const handleToolCall = (state: EventHandlerState, event: PrintModeToolCall) => {
  // Close any open native reasoning blocks when a tool call happens
  // (agent may go directly from thinking to tool calls without emitting text)
  // This must happen BEFORE any early returns (spawn_agents, hidden tools)
  if (event.parentAgentId && event.agentId) {
    // For agent tool calls, close reasoning in that specific agent
    state.message.updater.updateAiMessageBlocks((blocks) =>
      closeNativeReasoningInAgent(blocks, event.agentId as string),
    )
  } else if (!event.parentAgentId) {
    // For root tool calls, close reasoning at root level
    state.message.updater.updateAiMessageBlocks(closeNativeReasoningBlock)
  }

  if (event.toolName === 'spawn_agents' && event.input?.agents) {
    handleSpawnAgentsToolCall(state, event)
    return
  }

  if (isHiddenToolName(event.toolName)) {
    return
  }

  handleRegularToolCall(state, event)
  updateStreamingAgents(state, { add: event.toolCallId })
}

/**
 * Flips a queued tool block back to not-queued (pending) once its per-path
 * write barrier has resolved. The runtime emits a `tool_start` event via a
 * non-blocking `.then` on the barrier promise once the prior same-path write
 * settles, so this always precedes the matching `tool_result`. Uses the same
 * recursive block-lookup style as `updateToolBlockWithOutput` so nested agent
 * tool blocks (when `parentAgentId` is set) are handled.
 */
const handleToolStart = (
  state: EventHandlerState,
  event: PrintModeToolStart,
) => {
  const flipQueued = (blocks: ContentBlock[]): ContentBlock[] =>
    blocks.map((block) => {
      if (block.type === 'tool' && block.toolCallId === event.toolCallId) {
        if (isTerminalToolBlock(block)) return block
        return { ...block, queued: false, lifecycle: 'running' as const }
      } else if (block.type === 'agent' && block.blocks) {
        const updatedBlocks = flipQueued(block.blocks)
        // Avoid creating a new agent block ref when nothing changed.
        if (isDeepStrictEqual(block.blocks, updatedBlocks)) {
          return block
        }
        return { ...block, blocks: updatedBlocks }
      }
      return block
    })

  state.message.updater.updateAiMessageBlocks((blocks) => flipQueued(blocks))
}

/**
 * Extracts the exact runtime child agent id from a spawn_agents report when
 * available. Older reports only had spawn index metadata; current reports carry
 * this id so out-of-order subagent_start blocks can still receive final output.
 */
const getSpawnResultAgentId = (result: any): string | undefined =>
  typeof result?.agentId === 'string' && result.agentId.trim()
    ? result.agentId
    : undefined

const getSpawnResultForBlock = (
  block: AgentContentBlock,
  toolCallId: string,
  results: any[],
): any | undefined => {
  if (block.spawnToolCallId === toolCallId && block.spawnIndex !== undefined) {
    return results[block.spawnIndex]
  }

  return results.find(
    (result) => getSpawnResultAgentId(result) === block.agentId,
  )
}

const applySpawnAgentResultToBlock = (
  block: AgentContentBlock,
  result: any,
): ContentBlock => {
  if (!result?.value) {
    return block
  }

  const backgroundJobId =
    result.value?.background === true && typeof result.value?.jobId === 'string'
      ? result.value.jobId
      : undefined

  const existingBlocks = block.blocks ?? []
  const { content, hasError } = extractSpawnAgentResultContent(result.value)
  // Check if the agent already streamed text content (e.g., basher).
  // Agents like thinker return all output at the end via lastMessage,
  // so we should add final content even if they have tool blocks.
  const hasStreamedTextContent = existingBlocks.some(
    (b) => b.type === 'text' && b.textType === 'text',
  )
  let finalBlocks =
    content && !hasStreamedTextContent
      ? [...existingBlocks, { type: 'text', content } as ContentBlock]
      : existingBlocks

  if (hasError || finalBlocks.length > 0) {
    return {
      ...block,
      blocks: finalBlocks,
      ...(backgroundJobId ? { backgroundJobId } : {}),
      status: hasError
        ? ('failed' as const)
        : backgroundJobId
          ? ('running' as const)
          : ('complete' as const),
    }
  }

  return block
}

/**
 * Recursively finds and updates agent blocks that match a spawn_agents result.
 */
const updateSpawnAgentBlocks = (
  blocks: ContentBlock[],
  toolCallId: string,
  results: any[],
): ContentBlock[] => {
  return blocks.map((block) => {
    if (block.type !== 'agent') {
      return block
    }

    const result = getSpawnResultForBlock(block, toolCallId, results)
    if (result) {
      return applySpawnAgentResultToBlock(block, result)
    }

    // Recursively process nested agent blocks
    if (block.blocks?.length) {
      const updatedNestedBlocks = updateSpawnAgentBlocks(
        block.blocks,
        toolCallId,
        results,
      )
      if (updatedNestedBlocks !== block.blocks) {
        return { ...block, blocks: updatedNestedBlocks }
      }
    }

    return block
  })
}

const handleSpawnAgentsResult = (
  state: EventHandlerState,
  toolCallId: string,
  results: any[],
) => {
  // Replace placeholder spawn agent blocks with their final text/status output.
  state.message.updater.updateAiMessageBlocks((blocks) =>
    updateSpawnAgentBlocks(blocks, toolCallId, results),
  )

  results.forEach((result, index: number) => {
    if (result?.value?.background === true) return
    const agentId = `${toolCallId}-${index}`
    updateStreamingAgents(state, { remove: agentId })
  })
}

const updateBackgroundAgentCard = (
  blocks: ContentBlock[],
  value: Record<string, unknown>,
): ContentBlock[] => {
  const jobId = typeof value.jobId === 'string' ? value.jobId : undefined
  if (!jobId) return blocks
  return blocks.map((block) => {
    if (block.type !== 'agent') return block
    if (block.backgroundJobId === jobId) {
      const status = String(value.status ?? 'running')
      const resultSummary = extractSpawnAgentResultContent(value.result)
      const chunks = Array.isArray(value.newChunks) ? value.newChunks : []
      const chunkText = chunks
        .map((chunk) => {
          if (!chunk || typeof chunk !== 'object') return ''
          const payload = (chunk as Record<string, unknown>).payload
          if (typeof payload === 'string') return payload
          if (
            payload &&
            typeof payload === 'object' &&
            typeof (payload as Record<string, unknown>).text === 'string'
          ) {
            return String((payload as Record<string, unknown>).text)
          }
          return ''
        })
        .filter(Boolean)
        .join('')
      const appended = [chunkText, resultSummary.content]
        .filter(Boolean)
        .join('\n')
      const existingBlocks = block.blocks ?? []
      return {
        ...block,
        blocks: appended
          ? [
              ...existingBlocks,
              { type: 'text', content: appended } as ContentBlock,
            ]
          : existingBlocks,
        status:
          status === 'completed'
            ? 'complete'
            : status === 'error'
              ? 'failed'
              : status === 'cancelled'
                ? 'cancelled'
                : 'running',
      }
    }
    return block.blocks
      ? { ...block, blocks: updateBackgroundAgentCard(block.blocks, value) }
      : block
  })
}

const appendResultOnlyToolBlockToAgent = (
  blocks: ContentBlock[],
  event: PrintModeToolResult,
): ContentBlock[] => {
  if (!event.agentId) return blocks

  return updateBlocksRecursively(blocks, event.agentId, (block) => {
    if (block.type !== 'agent') return block
    const existingBlocks = block.blocks ?? []
    if (
      existingBlocks.some(
        (child) =>
          child.type === 'tool' && child.toolCallId === event.toolCallId,
      )
    ) {
      return block
    }

    const resultOnlyToolBlock: ToolContentBlock = {
      type: 'tool',
      toolCallId: event.toolCallId,
      toolName: event.toolName as ToolName,
      input: {},
      agentId: event.agentId,
      lifecycle: hasMultipartError(event.output) ? 'failed' : 'succeeded',
    }

    return {
      ...block,
      blocks: updateToolBlockWithOutput(
        [...existingBlocks, resultOnlyToolBlock],
        {
          toolCallId: event.toolCallId,
          toolOutput: event.output,
        },
      ),
    }
  })
}

const handleToolResult = (
  state: EventHandlerState,
  event: PrintModeToolResult,
) => {
  const askUserResult = (event.output?.[0] as any)?.value
  state.message.updater.updateAiMessageBlocks((blocks) =>
    transformAskUserBlocks(blocks, {
      toolCallId: event.toolCallId,
      resultValue: askUserResult,
    }),
  )

  const firstOutput = event.output?.[0]
  const firstOutputValue =
    firstOutput && 'value' in firstOutput ? firstOutput.value : undefined
  const isSpawnAgentsResult =
    Array.isArray(firstOutputValue) &&
    firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

  if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
    handleSpawnAgentsResult(state, event.toolCallId, firstOutputValue)
    return
  }

  if (
    event.toolName === 'check_background_agent' &&
    firstOutputValue &&
    typeof firstOutputValue === 'object' &&
    !Array.isArray(firstOutputValue)
  ) {
    state.message.updater.updateAiMessageBlocks((blocks) =>
      updateBackgroundAgentCard(
        blocks,
        firstOutputValue as Record<string, unknown>,
      ),
    )
  }

  state.message.updater.updateAiMessageBlocks((blocks) => {
    const updatedBlocks = updateToolBlockWithOutput(blocks, {
      toolCallId: event.toolCallId,
      toolOutput: event.output,
    })
    const withLifecycle = updatedBlocks.map(
      function markResult(block): ContentBlock {
        if (block.type === 'tool' && block.toolCallId === event.toolCallId) {
          if (block.lifecycle === 'cancelled') {
            const mutation = getCanonicalMutationResult(event.output)
            if (!mutation) return block
            return {
              ...block,
              interrupted: true,
              lifecycle:
                mutation.outcome === 'applied' ||
                mutation.outcome === 'rolled_back'
                  ? 'succeeded'
                  : 'failed',
            }
          }
          return {
            ...block,
            lifecycle: hasMultipartError(event.output) ? 'failed' : 'succeeded',
          }
        }
        if (block.type === 'agent' && block.blocks) {
          return { ...block, blocks: block.blocks.map(markResult) }
        }
        return block
      },
    )
    return appendResultOnlyToolBlockToAgent(withLifecycle, event)
  })

  updateStreamingAgents(state, { remove: event.toolCallId })
}

const handlePhase = (state: EventHandlerState, event: PrintModePhase) => {
  // Phase events provide structured progress info for the status bar.
  // The detail field carries a human-readable description (e.g. "reading 5 files").
  // These are stored on the stream refs so the status bar can read them.
  state.streaming.streamRefs.setters.setPhase({
    phase: event.phase,
    detail: event.detail,
  })
}

const handleContextWindow = (
  state: EventHandlerState,
  event: PrintModeContextWindow,
) => {
  // Context-window events carry the current token usage and max so the
  // CLI status bar can display how full the context window is.
  state.streaming.setContextWindowUsage({
    used: event.used,
    max: event.max,
  })
}

const handleContextCompaction = (
  state: EventHandlerState,
  event: PrintModeContextCompaction,
) => {
  const action =
    event.action === 'semantic_compaction'
      ? 'Semantic context compaction'
      : 'Emergency context trim'
  const removed =
    event.removedCategories.length > 0
      ? ` Removed: ${event.removedCategories.join(', ')}.`
      : ''
  const retained = event.retainedKnowledgeMemory
    ? ' Retained knowledge memory: yes.'
    : ' Retained knowledge memory: no.'
  const content = `${action}: ${event.before.tokens.toLocaleString()} → ${event.after.tokens.toLocaleString()} tokens; ${event.before.messages} → ${event.after.messages} messages.${removed}${retained} ${event.recovery}`

  state.message.updater.updateAiMessageBlocks((blocks) => [
    ...blocks,
    {
      type: 'text' as const,
      textType: 'text' as const,
      content,
    },
  ])
}

const handleFinish = (state: EventHandlerState, event: PrintModeFinish) => {
  if (typeof event.totalCost === 'number' && state.onTotalCost) {
    state.onTotalCost(event.totalCost)
  }

  // Compute and append a completion summary as a text block.
  const settledIds = new Set<string>()
  state.message.updater.updateAiMessageBlocks((blocks) => {
    const settledBlocks = settleOrphanedForegroundAgents(blocks, settledIds)
    // Walk the accumulated blocks to tally what happened
    const summary = computeCompletionSummary(settledBlocks)
    if (!summary) return settledBlocks

    const formatted = formatCompletionSummary(summary)
    if (!formatted) return settledBlocks

    return [
      ...settledBlocks,
      {
        type: 'text' as const,
        textType: 'text' as const,
        content: formatted,
      },
    ]
  })
  for (const id of settledIds) {
    updateStreamingAgents(state, { remove: id })
  }
}

const settleOrphanedForegroundAgents = (
  blocks: ContentBlock[],
  settledIds: Set<string>,
): ContentBlock[] =>
  blocks.map((block) => {
    if (block.type === 'tool') {
      if (isTerminalToolBlock(block) || block.outputRaw !== undefined) {
        return block
      }
      settledIds.add(block.toolCallId)
      return { ...block, queued: false, lifecycle: 'failed' as const }
    }
    if (block.type !== 'agent') return block
    // Detached background agents remain live after the root turn finishes and
    // are reconciled only by check_background_agent.
    if (block.backgroundJobId && block.status === 'running') return block
    const nestedBlocks = block.blocks
      ? settleOrphanedForegroundAgents(block.blocks, settledIds)
      : block.blocks
    if (block.status === 'running' && !block.backgroundJobId) {
      settledIds.add(block.agentId)
      return { ...block, blocks: nestedBlocks, status: 'failed' as const }
    }
    return nestedBlocks === block.blocks
      ? block
      : { ...block, blocks: nestedBlocks }
  })

const handleRuntimeError = (
  state: EventHandlerState,
  event: Extract<SDKEvent, { type: 'error' }>,
) => {
  const message = event.message
    .split('\n')
    .filter((line, index) => index === 0 || !/^\s*at\s/.test(line))
    .join('\n')
    .trim()
  state.logger.error({ event }, 'SDK runtime error event')
  state.message.updater.setError(
    message || 'The agent runtime reported an error.',
  )
}

const handleProviderStatus = (
  state: EventHandlerState,
  event: Extract<SDKEvent, { type: 'provider_status' }>,
) => {
  state.setIsRetrying(event.status !== 'recovered')
  const content =
    event.status === 'retrying'
      ? `Provider request failed; retrying${event.attempt ? ` (attempt ${event.attempt}/${event.maxAttempts})` : ''}${event.delayMs ? ` in ${(event.delayMs / 1000).toFixed(1)}s` : ''}.`
      : event.status === 'failover'
        ? `Provider failover: ${event.model ?? 'primary model'} → ${event.nextModel ?? 'backup model'}.`
        : `Provider connection recovered${event.model ? ` on ${event.model}` : ''}.`
  state.message.updater.updateAiMessageBlocks((blocks) => [
    ...blocks,
    { type: 'text' as const, textType: 'text' as const, content },
  ])
}

export const createStreamChunkHandler =
  (state: EventHandlerState) => (event: StreamChunkEvent) => {
    const destination = destinationFromChunkEvent(event)
    let text: string | undefined
    if (typeof event === 'string') {
      text = event
    } else {
      text = event.chunk
    }

    if (!destination) {
      state.logger.warn({ event }, 'Unhandled stream chunk event')
      return
    }

    if (!text) {
      return
    }

    ensureStreaming(state)

    if (destination.type === 'root') {
      if (destination.textType === 'text') {
        state.streaming.streamRefs.setters.appendRootStreamBuffer(text)
      }
      state.streaming.streamRefs.setters.setRootStreamSeen(true)
      appendRootChunk(state, { type: destination.textType, text })
      return
    }

    state.message.updater.updateAiMessageBlocks((blocks) =>
      processTextChunk(blocks, destination, text),
    )
  }

export const createEventHandler =
  (state: EventHandlerState) => (event: SDKEvent) => {
    return match(event)
      .with({ type: 'subagent_start' }, (e) => handleSubagentStart(state, e))
      .with({ type: 'subagent_finish' }, (e) => handleSubagentFinish(state, e))
      .with({ type: 'tool_call' }, (e) => handleToolCall(state, e))
      .with({ type: 'tool_start' }, (e) => handleToolStart(state, e))
      .with({ type: 'tool_result' }, (e) => handleToolResult(state, e))
      .with({ type: 'finish' }, (e) => handleFinish(state, e))
      .with({ type: 'error' }, (e) => handleRuntimeError(state, e))
      .with({ type: 'provider_status' }, (e) => handleProviderStatus(state, e))
      .with({ type: 'phase' }, (e) => handlePhase(state, e))
      .with({ type: 'context_window' }, (e) => handleContextWindow(state, e))
      .with({ type: 'context_compaction' }, (e) =>
        handleContextCompaction(state, e),
      )
      .otherwise(() => undefined)
  }
