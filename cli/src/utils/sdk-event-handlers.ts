import { match } from 'ts-pattern'

import {
  appendTextToRootStream,
  appendToolToAgentBlock,
  closeNativeReasoningBlock,
  closeNativeReasoningInAgent,
  markAgentComplete,
} from './block-operations'
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
  synthesizeMultiPromptProposalAgentBlocks,
  synthesizeProposalToolBlocks,
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
  PrintModeEvent as SDKEvent,
  PrintModeFinish,
  PrintModePhase,
  PrintModeSubagentFinish,
  PrintModeSubagentStart,
  PrintModeToolCall,
  PrintModeToolResult,
} from '@codebuff/common/types/print-mode'
import type { ToolName } from '@codebuff/sdk'
import type { MutableRefObject } from 'react'

export type SetStreamingAgentsFn = (
  updater: (prev: Set<string>) => Set<string>,
) => void

export type SetStreamStatusFn = (status: StreamStatus) => void

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
    !state.streaming.streamRefs.state.planExtracted &&
    state.streaming.streamRefs.state.rootStreamBuffer.includes('</PLAN>')
  ) {
    const rawPlan = extractPlanFromBuffer(
      state.streaming.streamRefs.state.rootStreamBuffer,
    )
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

  state.message.updater.updateAiMessageBlocks((blocks) =>
    markAgentComplete(blocks, event.agentId),
  )

  updateStreamingAgents(state, { remove: event.agentId })
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

  return results.find((result) => getSpawnResultAgentId(result) === block.agentId)
}

const applySpawnAgentResultToBlock = (
  block: AgentContentBlock,
  result: any,
): ContentBlock => {
  if (!result?.value) {
    return block
  }

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

  // Proposal/implementor agents can finish with incomplete live tool blocks:
  // a tool call may be present on the card, while the diff-bearing result only
  // survives in the final structured output. Merge those final blocks unless
  // the same file already has a renderable diff, so the card cannot complete
  // as "no changes" just because a partial edit block streamed first.
  const synthesized = synthesizeProposalToolBlocks(result.value)
  if (synthesized.length > 0) {
    finalBlocks = mergeSynthesizedProposalToolBlocks(finalBlocks, synthesized)
  }

  if (block.agentType.includes('editor-multi-prompt')) {
    finalBlocks = mergeSynthesizedMultiPromptProposalBlocks(
      finalBlocks,
      synthesizeMultiPromptProposalAgentBlocks(result.value),
    )
  }

  if (hasError || finalBlocks.length > 0) {
    return {
      ...block,
      blocks: finalBlocks,
      status: hasError ? ('failed' as const) : ('complete' as const),
    }
  }

  return block
}

const mergeSynthesizedProposalToolBlocks = (
  existingBlocks: ContentBlock[],
  synthesizedBlocks: ToolContentBlock[],
): ContentBlock[] => {
  const existingFilesWithDiff = new Set<string>()

  for (const block of existingBlocks) {
    if (!isEditToolBlock(block)) continue
    const toolBlock = block as ToolContentBlock
    const file = extractFilePath(toolBlock)
    const diff = extractDiff(toolBlock)
    if (file && diff?.trim()) {
      existingFilesWithDiff.add(file)
    }
  }

  const blocksToAppend = synthesizedBlocks.filter((block) => {
    const file = extractFilePath(block)
    return !file || !existingFilesWithDiff.has(file)
  })

  return blocksToAppend.length > 0
    ? [...existingBlocks, ...blocksToAppend]
    : existingBlocks
}

const getProposalBlockLabel = (
  block: AgentContentBlock,
): string | undefined => {
  const label = getImplementorDisplayName(
    block.agentType,
    undefined,
    block.params,
  ).trim()
  return label || undefined
}

const getProposalBlockOrdinal = (
  block: AgentContentBlock,
): number | undefined => {
  const ordinal = block.params?.proposalOrdinal
  const ordinalNumber =
    typeof ordinal === 'number'
      ? ordinal
      : typeof ordinal === 'string' && ordinal.trim()
        ? Number(ordinal.trim())
        : undefined

  return ordinalNumber !== undefined &&
    Number.isInteger(ordinalNumber) &&
    ordinalNumber > 0
    ? ordinalNumber
    : undefined
}

const isInitialProposalBlock = (block: AgentContentBlock): boolean => {
  const phase = block.params?.proposalPhase
  return (
    block.agentType.includes('editor-implementor-proposal') &&
    (phase === undefined || phase === 'initial')
  )
}

const mergeSynthesizedMultiPromptProposalBlocks = (
  existingBlocks: ContentBlock[],
  synthesizedAgents: AgentContentBlock[],
): ContentBlock[] => {
  if (synthesizedAgents.length === 0) return existingBlocks

  const synthesizedByLabel = new Map<string, number>()
  for (const [index, agent] of synthesizedAgents.entries()) {
    const label = getProposalBlockLabel(agent)
    if (label && !synthesizedByLabel.has(label)) {
      synthesizedByLabel.set(label, index)
    }
  }
  const consumedSynthesized = new Set<number>()

  const takeSynthesized = (
    index: number | undefined,
  ): AgentContentBlock | undefined => {
    if (
      index === undefined ||
      index < 0 ||
      index >= synthesizedAgents.length ||
      consumedSynthesized.has(index)
    ) {
      return undefined
    }

    consumedSynthesized.add(index)
    return synthesizedAgents[index]
  }

  const takeSynthesizedForBlock = (
    block: AgentContentBlock,
    proposalOrderIndex: number | undefined,
  ): AgentContentBlock | undefined => {
    const label = getProposalBlockLabel(block)
    const labeledMatch = label
      ? takeSynthesized(synthesizedByLabel.get(label))
      : undefined
    if (labeledMatch) return labeledMatch

    const ordinal = getProposalBlockOrdinal(block)
    const ordinalMatch =
      ordinal !== undefined ? takeSynthesized(ordinal - 1) : undefined
    if (ordinalMatch) return ordinalMatch

    return proposalOrderIndex !== undefined
      ? takeSynthesized(proposalOrderIndex)
      : undefined
  }

  let proposalOrderIndex = 0
  const mergedBlocks = existingBlocks.map((block) => {
    if (block.type !== 'agent' || !isImplementorAgent(block)) {
      return block
    }

    const fallbackOrderIndex = isInitialProposalBlock(block)
      ? proposalOrderIndex++
      : undefined
    const synthesized = takeSynthesizedForBlock(block, fallbackOrderIndex)
    if (!synthesized) return block

    return {
      ...block,
      agentName: synthesized.agentName || block.agentName,
      status: block.status === 'failed' ? block.status : synthesized.status,
      params: {
        ...(synthesized.params ?? {}),
        ...(block.params ?? {}),
      },
      blocks: mergeSynthesizedProposalToolBlocks(
        block.blocks ?? [],
        (synthesized.blocks ?? []).filter(
          (child): child is ToolContentBlock => child.type === 'tool',
        ),
      ),
    }
  })

  const remainingSynthesized = synthesizedAgents.filter(
    (_, index) => !consumedSynthesized.has(index),
  )
  return remainingSynthesized.length > 0
    ? [...mergedBlocks, ...remainingSynthesized]
    : mergedBlocks
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

  results.forEach((_, index: number) => {
    const agentId = `${toolCallId}-${index}`
    updateStreamingAgents(state, { remove: agentId })
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
        (child) => child.type === 'tool' && child.toolCallId === event.toolCallId,
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
  const firstOutputValue = firstOutput && 'value' in firstOutput ? firstOutput.value : undefined
  const isSpawnAgentsResult =
    Array.isArray(firstOutputValue) &&
    firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

  if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
    handleSpawnAgentsResult(state, event.toolCallId, firstOutputValue)
    return
  }

  state.message.updater.updateAiMessageBlocks((blocks) => {
    const updatedBlocks = updateToolBlockWithOutput(blocks, {
      toolCallId: event.toolCallId,
      toolOutput: event.output,
    })
    return appendResultOnlyToolBlockToAgent(updatedBlocks, event)
  })

  updateStreamingAgents(state, { remove: event.toolCallId })
}

const handlePhase = (
  state: EventHandlerState,
  event: PrintModePhase,
) => {
  // Phase events provide structured progress info for the status bar.
  // The detail field carries a human-readable description (e.g. "reading 5 files").
  // These are stored on the stream refs so the status bar can read them.
  state.streaming.streamRefs.setters.setPhase({
    phase: event.phase,
    detail: event.detail,
  })
}

const handleFinish = (state: EventHandlerState, event: PrintModeFinish) => {
  if (typeof event.totalCost === 'number' && state.onTotalCost) {
    state.onTotalCost(event.totalCost)
  }

  // Compute and append a completion summary as a text block.
  state.message.updater.updateAiMessageBlocks((blocks) => {
    // Walk the accumulated blocks to tally what happened
    const summary = computeCompletionSummary(blocks)
    if (!summary) return blocks

    const formatted = formatCompletionSummary(summary)
    if (!formatted) return blocks

    return [
      ...blocks,
      {
        type: 'text' as const,
        textType: 'text' as const,
        content: formatted,
      },
    ]
  })
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
      .with({ type: 'tool_result' }, (e) => handleToolResult(state, e))
      .with({ type: 'finish' }, (e) => handleFinish(state, e))
      .with({ type: 'phase' }, (e) => handlePhase(state, e))
      .otherwise(() => undefined)
  }
