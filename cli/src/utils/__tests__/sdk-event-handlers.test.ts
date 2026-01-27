import { describe, expect, test } from 'bun:test'

import { createAgentBlock } from '../message-block-helpers'
import { createMessageUpdater } from '../message-updater'
import {
  createEventHandler,
  createStreamChunkHandler,
} from '../sdk-event-handlers'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { StreamStatus } from '../../hooks/use-message-queue'
import type { AgentContentBlock, ChatMessage } from '../../types/chat'
import type { AgentMode } from '../constants'
import type { EventHandlerState } from '../sdk-event-handlers'

// Type for spawn agent info stored in the map
interface SpawnAgentInfo {
  index: number
  agentType: string
}

// SDK event types for testing
interface SubagentStartEvent {
  type: 'subagent_start'
  agentId: string
  agentType: string
  displayName: string
  onlyChild: boolean
  parentAgentId: string | undefined
  params: Record<string, unknown> | undefined
  prompt: string | undefined
}

interface ToolResultEvent {
  type: 'tool_result'
  toolCallId: string
  toolName: string
  output: Array<{
    type: 'json'
    value: Array<{
      agentName: string
      value: string
    }>
  }>
}

const createStreamRefs = (): {
  controller: EventHandlerState['streaming']['streamRefs']
  state: {
    rootStreamBuffer: string
    agentStreamAccumulators: Map<string, string>
    rootStreamSeen: boolean
    planExtracted: boolean
    wasAbortedByUser: boolean
    spawnAgentsMap: Map<string, SpawnAgentInfo>
  }
} => {
  const state = {
    rootStreamBuffer: '',
    agentStreamAccumulators: new Map<string, string>(),
    rootStreamSeen: false,
    planExtracted: false,
    wasAbortedByUser: false,
    spawnAgentsMap: new Map<string, SpawnAgentInfo>(),
  }

  const controller = {
    state,
    reset: () => {},
    setters: {
      setRootStreamBuffer: (value: string) => {
        state.rootStreamBuffer = value
      },
      appendRootStreamBuffer: (value: string) => {
        state.rootStreamBuffer += value
      },
      setAgentAccumulator: (agentId: string, value: string) => {
        state.agentStreamAccumulators.set(agentId, value)
      },
      removeAgentAccumulator: (agentId: string) => {
        state.agentStreamAccumulators.delete(agentId)
      },
      setRootStreamSeen: (value: boolean) => {
        state.rootStreamSeen = value
      },
      setPlanExtracted: (value: boolean) => {
        state.planExtracted = value
      },
      setWasAbortedByUser: (value: boolean) => {
        state.wasAbortedByUser = value
      },
      setSpawnAgentInfo: (agentId: string, info: SpawnAgentInfo) => {
        state.spawnAgentsMap.set(agentId, info)
      },
      removeSpawnAgentInfo: (agentId: string) => {
        state.spawnAgentsMap.delete(agentId)
      },
    },
  }

  return { controller, state }
}

const createTestContext = (agentMode: AgentMode = 'DEFAULT') => {
  let messages: ChatMessage[] = [
    {
      id: 'ai-1',
      variant: 'ai',
      content: '',
      blocks: [],
      timestamp: 'now',
    },
  ]
  let streamingAgents = new Set<string>()
  let streamStatus: StreamStatus | null = null
  let hasPlanResponse = false
  const streamRefs = createStreamRefs()

  const updater = createMessageUpdater(
    'ai-1',
    (fn: (msgs: ChatMessage[]) => ChatMessage[]) => {
      messages = fn(messages)
    },
  )

  const ctx: EventHandlerState = {
    streaming: {
      streamRefs: streamRefs.controller,
      setStreamingAgents: (fn: (prev: Set<string>) => Set<string>) => {
        streamingAgents = fn(streamingAgents)
      },
      setStreamStatus: (status: StreamStatus) => {
        streamStatus = status
      },
    },
    message: {
      aiMessageId: 'ai-1',
      updater,
      hasReceivedContentRef: { current: false },
    },
    subagents: {
      addActiveSubagent: () => {},
      removeActiveSubagent: () => {},
    },
    mode: {
      agentMode,
      setHasReceivedPlanResponse: (value: boolean) => {
        hasPlanResponse = value
      },
    },
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {},
    } as Logger,
    setIsRetrying: () => {},
  }

  return {
    ctx,
    getMessages: () => messages,
    getStreamingAgents: () => streamingAgents,
    getStreamStatus: () => streamStatus,
    getHasPlanResponse: () => hasPlanResponse,
    streamRefs,
  }
}

describe('sdk-event-handlers', () => {
  test('extracts plan content from root stream', () => {
    const { ctx, getMessages, getHasPlanResponse } = createTestContext('PLAN')
    const handleChunk = createStreamChunkHandler(ctx)

    handleChunk('<PLAN>Build plan</PLAN>')

    const blocks = getMessages()[0].blocks ?? []
    expect(blocks.find((b) => b.type === 'plan')).toMatchObject({
      content: 'Build plan',
    })
    expect(getHasPlanResponse()).toBe(true)
  })

  test('maps spawn agent placeholder to real agent', () => {
    const { ctx, getMessages, getStreamingAgents, streamRefs } =
      createTestContext()
    ctx.streaming.setStreamingAgents(() => new Set(['tool-1-0']))
    ctx.message.updater.addBlock(
      createAgentBlock({ agentId: 'tool-1-0', agentType: 'temp' }),
    )
    streamRefs.controller.setters.setSpawnAgentInfo('tool-1-0', {
      index: 0,
      agentType: 'file-picker',
    })

    const handleEvent = createEventHandler(ctx)
    const startEvent: SubagentStartEvent = {
      type: 'subagent_start',
      agentId: 'agent-real',
      agentType: 'codebuff/file-picker@1.0.0',
      displayName: 'Agent',
      onlyChild: false,
      parentAgentId: undefined,
      params: undefined,
      prompt: undefined,
    }
    handleEvent(startEvent)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.agentId).toBe('agent-real')
    expect(getStreamingAgents().has('agent-real')).toBe(true)
    expect(getStreamingAgents().has('tool-1-0')).toBe(false)
  })

  test('handles spawn_agents tool results and clears streaming agents', () => {
    const { ctx, getMessages, getStreamingAgents } = createTestContext()
    ctx.message.updater.addBlock(
      createAgentBlock({
        agentId: 'tool-1-0',
        agentType: 'temp',
        spawnToolCallId: 'tool-1',
        spawnIndex: 0,
      }),
    )
    ctx.streaming.setStreamingAgents(() => new Set(['tool-1-0']))

    const handleEvent = createEventHandler(ctx)
    const toolResultEvent: ToolResultEvent = {
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentName: 'child',
              value: 'child result',
            },
          ],
        },
      ],
    }
    handleEvent(toolResultEvent)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')
    expect(agentBlock.blocks?.[0]).toMatchObject({
      type: 'text',
      content: 'child result',
    })
    expect(getStreamingAgents().size).toBe(0)
  })
})
