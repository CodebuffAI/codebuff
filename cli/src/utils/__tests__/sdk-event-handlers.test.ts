import { describe, expect, test } from 'bun:test'

import { createMessageUpdater } from '../message-updater'
import { createEventHandler, createStreamChunkHandler } from '../sdk-event-handlers'

import type { ChatMessage } from '../../types/chat'
import type { EventHandlerState } from '../sdk-event-handlers'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const createTestContext = () => {
  let messages: ChatMessage[] = [
    {
      id: 'ai-1',
      variant: 'ai',
      content: '',
      blocks: [],
      timestamp: 'now',
    },
  ]
  const updater = createMessageUpdater(
    'ai-1',
    (fn: (msgs: ChatMessage[]) => ChatMessage[]) => {
      messages = fn(messages)
    },
  )

  const ctx: EventHandlerState = {
    streaming: {
      streamRefs: {
        state: {
          rootStreamBuffer: '',
          agentStreamAccumulators: new Map(),
          rootStreamSeen: false,
          planExtracted: false,
          wasAbortedByUser: false,
          spawnAgentsMap: new Map(),
          phase: null,
        },
        reset: () => {},
        setters: {
          setRootStreamBuffer: () => {},
          appendRootStreamBuffer: () => {},
          setAgentAccumulator: () => {},
          removeAgentAccumulator: () => {},
          setRootStreamSeen: () => {},
          setPlanExtracted: () => {},
          setWasAbortedByUser: () => {},
          setSpawnAgentInfo: () => {},
          removeSpawnAgentInfo: () => {},
          setPhase: () => {},
        },
      },
      setStreamingAgents: () => {},
      setStreamStatus: () => {},
      setContextWindowUsage: () => {},
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
      agentMode: 'PLAN',
      setHasReceivedPlanResponse: () => {},
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
  }
}

describe('sdk-event-handlers', () => {
  test('extracts plan content from root stream', () => {
    const { ctx, getMessages } = createTestContext()
    const handleChunk = createStreamChunkHandler(ctx)

    handleChunk('<PLAN>Build plan</PLAN>')

    const blocks = getMessages()[0].blocks ?? []
    expect(blocks.find((block) => block.type === 'plan')).toMatchObject({
      content: 'Build plan',
    })
  })

  test('handles context_window event by calling setContextWindowUsage', () => {
    const captured: { usage: { used: number; max: number } | null } = {
      usage: null,
    }
    const { ctx } = createTestContext()
    ctx.streaming.setContextWindowUsage = (usage) => {
      captured.usage = usage
    }
    const handleEvent = createEventHandler(ctx)

    handleEvent({ type: 'context_window', used: 50000, max: 200000 })

    expect(captured.usage).toEqual({ used: 50000, max: 200000 })
  })
})
