import { has } from 'lodash'
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
  destinationFromTextEvent,
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

export type EventHandlerContext = {
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

const ensureStreaming = (ctx: EventHandlerContext) => {
  if (!ctx.message.hasReceivedContentRef.current) {
    ctx.message.hasReceivedContentRef.current = true
    ctx.streaming.setStreamStatus('streaming')
    ctx.setIsRetrying(false)
  }
}

const appendRootChunk = (ctx: EventHandlerContext, delta: TextDelta) => {
  if (!delta.text) {
    return
  }

  ctx.message.updater.updateAiMessageBlocks((blocks) =>
    appendTextToRootStream(blocks, delta),
  )

  if (
    ctx.mode.agentMode === 'PLAN' &&
    delta.type === 'text' &&
    !ctx.streaming.streamRefs.state.planExtracted &&
    ctx.streaming.streamRefs.state.rootStreamBuffer.includes('</PLAN>')
  ) {
    const rawPlan = extractPlanFromBuffer(
      ctx.streaming.streamRefs.state.rootStreamBuffer,
    )
    if (rawPlan !== null) {
      ctx.streaming.streamRefs.setters.setPlanExtracted(true)
      ctx.mode.setHasReceivedPlanResponse(true)
      ctx.message.updater.updateAiMessageBlocks((blocks) =>
        insertPlanBlock(blocks, rawPlan),
      )
    }
  }
}

const updateStreamingAgents = (
  ctx: EventHandlerContext,
  op: { add?: string; remove?: string },
) => {
  ctx.streaming.setStreamingAgents((prev) => {
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

const handleTextEvent = (ctx: EventHandlerContext, event: PrintModeText) => {
  if (!event.text) {
    return
  }

  ensureStreaming(ctx)

  const destination = destinationFromTextEvent(event)
  const text = event.text

  if (destination.type === 'agent') {
    const previous =
      ctx.streaming.streamRefs.state.agentStreamAccumulators.get(
        destination.agentId,
      ) ?? ''
    ctx.streaming.streamRefs.setters.setAgentAccumulator(
      destination.agentId,
      previous + text,
    )
    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      processTextChunk(blocks, destination, text),
    )
    return
  }

  if (ctx.streaming.streamRefs.state.rootStreamSeen) {
    return
  }

  ctx.streaming.streamRefs.setters.appendRootStreamBuffer(text)
  ctx.streaming.streamRefs.setters.setRootStreamSeen(true)
  appendRootChunk(ctx, { type: destination.textType, text })
}

const handleSubagentStart = (
  ctx: EventHandlerContext,
  event: PrintModeSubagentStart,
) => {
  if (shouldHideAgent(event.agentType)) {
    return
  }

  ctx.subagents.addActiveSubagent(event.agentId)

  const spawnAgentMatch = findMatchingSpawnAgent(
    ctx.streaming.streamRefs.state.spawnAgentsMap,
    event.agentType || '',
  )

  if (spawnAgentMatch) {
    ctx.logger.info(
      {
        tempId: spawnAgentMatch.tempId,
        realAgentId: event.agentId,
        agentType: event.agentType,
        hasParentAgentId: !!event.parentAgentId,
      },
      'Matching spawn_agents block found',
    )

    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      resolveSpawnAgentToReal({
        blocks,
        match: spawnAgentMatch,
        realAgentId: event.agentId,
        parentAgentId: event.parentAgentId,
        params: event.params,
        prompt: event.prompt,
      }),
    )

    updateStreamingAgents(ctx, {
      remove: spawnAgentMatch.tempId,
      add: event.agentId,
    })
    ctx.streaming.streamRefs.setters.removeSpawnAgentInfo(
      spawnAgentMatch.tempId,
    )
    return
  }

  ctx.logger.info(
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

  ctx.message.updater.updateAiMessageBlocks((blocks) => {
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

  updateStreamingAgents(ctx, { add: event.agentId })
}

const handleSubagentFinish = (
  ctx: EventHandlerContext,
  event: PrintModeSubagentFinish,
) => {
  if (shouldHideAgent(event.agentType)) {
    return
  }

  ctx.streaming.streamRefs.setters.removeAgentAccumulator(event.agentId)
  ctx.subagents.removeActiveSubagent(event.agentId)

  ctx.message.updater.updateAiMessageBlocks((blocks) =>
    markAgentComplete(blocks, event.agentId),
  )

  updateStreamingAgents(ctx, { remove: event.agentId })
}

const handleSpawnAgentsToolCall = (
  ctx: EventHandlerContext,
  event: PrintModeToolCall,
) => {
  const agents = Array.isArray(event.input?.agents) ? event.input?.agents : []

  agents.forEach((agent: any, index: number) => {
    const tempAgentId = `${event.toolCallId}-${index}`
    ctx.streaming.streamRefs.setters.setSpawnAgentInfo(tempAgentId, {
      index,
      agentType: agent.agent_type || 'unknown',
    })
  })

  ctx.message.updater.updateAiMessageBlocks((blocks) => {
    const newAgentBlocks: ContentBlock[] = agents
      .filter((agent: any) => !shouldHideAgent(agent.agent_type || ''))
      .map((agent: any, index: number) =>
        createAgentBlock({
          agentId: `${event.toolCallId}-${index}`,
          agentType: agent.agent_type || '',
          prompt: agent.prompt,
        }),
      )

    return [...blocks, ...newAgentBlocks]
  })

  agents.forEach((_: any, index: number) => {
    updateStreamingAgents(ctx, { add: `${event.toolCallId}-${index}` })
  })
}

const handleRegularToolCall = (
  ctx: EventHandlerContext,
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
    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      appendToolToAgentBlock(blocks, event.agentId as string, newToolBlock),
    )
    return
  }

  ctx.message.updater.updateAiMessageBlocks((blocks) => [
    ...blocks,
    newToolBlock,
  ])
}

const handleToolCall = (ctx: EventHandlerContext, event: PrintModeToolCall) => {
  if (event.toolName === 'spawn_agents' && event.input?.agents) {
    handleSpawnAgentsToolCall(ctx, event)
    return
  }

  if (isHiddenToolName(event.toolName)) {
    return
  }

  handleRegularToolCall(ctx, event)
  updateStreamingAgents(ctx, { add: event.toolCallId })
}

const handleSpawnAgentsResult = (
  ctx: EventHandlerContext,
  toolCallId: string,
  results: any[],
) => {
  // Replace placeholder spawn agent blocks with their final text/status output.
  ctx.message.updater.updateAiMessageBlocks((blocks) =>
    blocks.map((block) => {
      if (
        block.type === 'agent' &&
        block.agentId.startsWith(toolCallId) &&
        block.blocks
      ) {
        const agentIndex = Number.parseInt(
          block.agentId.split('-').pop() || '0',
          10,
        )
        const result = results[agentIndex]

        if (has(result, 'value') && result.value) {
          const { content, hasError } = extractSpawnAgentResultContent(
            result.value,
          )
          const resultTextBlock: ContentBlock = {
            type: 'text',
            content,
          }
          return {
            ...block,
            blocks: [resultTextBlock],
            status: hasError ? ('failed' as const) : ('complete' as const),
          }
        }
      }
      return block
    }),
  )

  results.forEach((_, index: number) => {
    const agentId = `${toolCallId}-${index}`
    updateStreamingAgents(ctx, { remove: agentId })
  })
}

const handleToolResult = (
  ctx: EventHandlerContext,
  event: PrintModeToolResult,
) => {
  const askUserResult = (event.output?.[0] as any)?.value
  ctx.message.updater.updateAiMessageBlocks((blocks) =>
    transformAskUserBlocks(blocks, {
      toolCallId: event.toolCallId,
      resultValue: askUserResult,
    }),
  )

  const firstOutputValue = has(event.output?.[0], 'value')
    ? event.output?.[0]?.value
    : undefined
  const isSpawnAgentsResult =
    Array.isArray(firstOutputValue) &&
    firstOutputValue.some((v: any) => v?.agentName || v?.agentType)

  if (isSpawnAgentsResult && Array.isArray(firstOutputValue)) {
    handleSpawnAgentsResult(ctx, event.toolCallId, firstOutputValue)
    return
  }

  ctx.message.updater.updateAiMessageBlocks((blocks) =>
    updateToolBlockWithOutput(blocks, {
      toolCallId: event.toolCallId,
      toolOutput: event.output,
    }),
  )

  updateStreamingAgents(ctx, { remove: event.toolCallId })
}

const handleFinish = (ctx: EventHandlerContext, event: PrintModeFinish) => {
  if (typeof event.totalCost === 'number' && ctx.onTotalCost) {
    ctx.onTotalCost(event.totalCost)
  }
}

export const createStreamChunkHandler =
  (ctx: EventHandlerContext) => (event: StreamChunkEvent) => {
    const destination = destinationFromChunkEvent(event)
    let text: string | undefined
    if (typeof event === 'string') {
      text = event
    } else {
      text = event.chunk
    }

    if (!destination) {
      ctx.logger.warn({ event }, 'Unhandled stream chunk event')
      return
    }

    if (!text) {
      return
    }

    ensureStreaming(ctx)

    if (destination.type === 'root') {
      if (destination.textType === 'text') {
        ctx.streaming.streamRefs.setters.appendRootStreamBuffer(text)
      }
      ctx.streaming.streamRefs.setters.setRootStreamSeen(true)
      appendRootChunk(ctx, { type: destination.textType, text })
      return
    }

    const previous =
      ctx.streaming.streamRefs.state.agentStreamAccumulators.get(
        destination.agentId,
      ) ?? ''

    ctx.streaming.streamRefs.setters.setAgentAccumulator(
      destination.agentId,
      previous + text,
    )

    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      processTextChunk(blocks, destination, text),
    )
  }

export const createEventHandler =
  (ctx: EventHandlerContext) => (event: SDKEvent) => {
    return match(event)
      .with({ type: 'text' }, (e) => handleTextEvent(ctx, e))
      .with({ type: 'subagent_start' }, (e) => handleSubagentStart(ctx, e))
      .with({ type: 'subagent_finish' }, (e) => handleSubagentFinish(ctx, e))
      .with({ type: 'tool_call' }, (e) => handleToolCall(ctx, e))
      .with({ type: 'tool_result' }, (e) => handleToolResult(ctx, e))
      .with({ type: 'finish' }, (e) => handleFinish(ctx, e))
      .otherwise(() => undefined)
  }
