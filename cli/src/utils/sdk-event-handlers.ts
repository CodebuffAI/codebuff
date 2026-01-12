import { match } from 'ts-pattern'

import {
  appendTextToRootStream,
  appendToolToAgentBlock,
  markAgentComplete,
} from './block-operations'
import { shouldHideAgent } from './constants'
import {
  createAgentBlock,
  extractPlanFromBuffer,
  extractSpawnAgentResultContent,
  insertPlanBlock,
  nestBlockUnderParent,
  transformAskUserBlocks,
  updateToolBlockWithOutput,
} from './message-block-helpers'
import {
  findMatchingSpawnAgent,
  resolveSpawnAgentToReal,
} from './spawn-agent-matcher'
import {
  destinationFromChunkEvent,
  processTextChunk,
} from './stream-chunk-processor'

import type { AgentMode } from './constants'
import type { MessageUpdater } from './message-updater'
import type { StreamController } from '../hooks/stream-state'
import type { StreamStatus } from '../hooks/use-message-queue'
import type { ContentBlock, ToolContentBlock } from '../types/chat'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  PrintModeEvent as SDKEvent,
  PrintModeFinish,
  PrintModeSubagentFinish,
  PrintModeSubagentStart,
  PrintModeText,
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
  addActiveSubagent: (id: string) => void
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

  state.subagents.addActiveSubagent(event.agentId)

  const spawnAgentMatch = findMatchingSpawnAgent(
    state.streaming.streamRefs.state.spawnAgentsMap,
    event.agentType || '',
  )

  if (spawnAgentMatch) {
    state.logger.info(
      {
        tempId: spawnAgentMatch.tempId,
        realAgentId: event.agentId,
        agentType: event.agentType,
        hasParentAgentId: !!event.parentAgentId,
      },
      'Matching spawn_agents block found',
    )

    state.message.updater.updateAiMessageBlocks((blocks) =>
      resolveSpawnAgentToReal({
        blocks,
        match: spawnAgentMatch,
        realAgentId: event.agentId,
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

  const newAgentBlock = createAgentBlock({
    agentId: event.agentId,
    agentType: event.agentType || '',
    prompt: event.prompt,
    params: event.params,
  })

  state.message.updater.updateAiMessageBlocks((blocks) => {
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
    const newAgentBlocks: ContentBlock[] = agents
      .map((agent: any, originalIndex: number) => ({ agent, originalIndex }))
      .filter(({ agent }) => !shouldHideAgent(agent.agent_type || ''))
      .map(({ agent, originalIndex }) =>
        createAgentBlock({
          agentId: `${event.toolCallId}-${originalIndex}`,
          agentType: agent.agent_type || '',
          prompt: agent.prompt,
          spawnToolCallId: event.toolCallId,
          spawnIndex: originalIndex,
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
 * Recursively finds and updates agent blocks that match a spawn_agents tool call.
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

    if (block.spawnToolCallId === toolCallId && block.spawnIndex !== undefined && block.blocks) {
      const result = results[block.spawnIndex]

      if (result?.value) {
        const { content, hasError } = extractSpawnAgentResultContent(result.value)
        
        // Check if there's meaningful text content already streamed
        const existingTextContent = block.blocks
          .filter((b): b is { type: 'text'; content: string } => b.type === 'text')
          .map(b => b.content)
          .join('')
          .trim()
        
        // Use extracted content from result if it's more substantial than existing streamed content.
        // This ensures agents with lastMessage output mode (like researcher-web) show their final
        // result inside the box, even if they had tool blocks or partial content during execution.
        const shouldUseExtractedContent = content && (!existingTextContent || content.length > existingTextContent.length)
        
        const hasStreamedContent = block.blocks.length > 0
        if (hasError || content || hasStreamedContent) {
          return {
            ...block,
            blocks: shouldUseExtractedContent ? [{ type: 'text', content } as ContentBlock] : block.blocks,
            status: hasError ? ('failed' as const) : ('complete' as const),
          }
        }
      }
    }

    // Recursively process nested agent blocks
    if (block.blocks?.length) {
      const updatedNestedBlocks = updateSpawnAgentBlocks(block.blocks, toolCallId, results)
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

  state.message.updater.updateAiMessageBlocks((blocks) =>
    updateToolBlockWithOutput(blocks, {
      toolCallId: event.toolCallId,
      toolOutput: event.output,
    }),
  )

  updateStreamingAgents(state, { remove: event.toolCallId })
}

const handleFinish = (state: EventHandlerState, event: PrintModeFinish) => {
  if (typeof event.totalCost === 'number' && state.onTotalCost) {
    state.onTotalCost(event.totalCost)
  }
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
      .otherwise(() => undefined)
  }
