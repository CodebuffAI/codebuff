import { describe, expect, test } from 'bun:test'

import { createMessageUpdater } from '../message-updater'
import {
  createEventHandler,
  createStreamChunkHandler,
} from '../sdk-event-handlers'

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
  test('renders provider retry/failover recovery as an ordered resilience timeline', () => {
    const { ctx, getMessages } = createTestContext()
    const retryStates: boolean[] = []
    ctx.setIsRetrying = (retrying) => retryStates.push(retrying)
    const handleEvent = createEventHandler(ctx)

    handleEvent({
      type: 'provider_status',
      status: 'retrying',
      model: 'primary',
      attempt: 2,
      maxAttempts: 4,
      delayMs: 500,
    })
    handleEvent({
      type: 'provider_status',
      status: 'failover',
      model: 'primary',
      nextModel: 'backup',
    })
    handleEvent({
      type: 'provider_status',
      status: 'recovered',
      model: 'backup',
    })

    expect(retryStates).toEqual([true, true, false])
    const text = getMessages()[0]
      .blocks?.map((block) => ('content' in block ? block.content : ''))
      .join('\n')
    expect(text).toContain('retrying (attempt 2/4)')
    expect(text).toContain('primary → backup')
    expect(text).toContain('recovered on backup')
  })

  test('surfaces runtime errors without stack-frame lines', () => {
    const { ctx, getMessages } = createTestContext()
    createEventHandler(ctx)({
      type: 'error',
      message: 'Provider failed\n    at secret/path.ts:1:2',
    })
    expect(getMessages()[0].userError).toBe('Provider failed')
  })

  test('background agent cards remain running until polling reports settlement', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'subagent_start',
      agentId: 'child-1',
      agentType: 'researcher-web',
      displayName: 'Researcher',
      parentAgentId: 'main-agent',
      spawnToolCallId: 'spawn-bg',
      spawnIndex: 0,
      prompt: 'research',
      onlyChild: true,
    } as any)
    handleEvent({
      type: 'tool_result',
      toolCallId: 'spawn-bg',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentId: 'child-1',
              agentName: 'Researcher',
              agentType: 'researcher-web',
              value: {
                background: true,
                jobId: 'bg-agent-1',
                message: 'launched',
              },
            },
          ],
        },
      ],
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({
      type: 'agent',
      status: 'running',
      backgroundJobId: 'bg-agent-1',
    })

    handleEvent({
      type: 'tool_result',
      toolCallId: 'check-bg',
      toolName: 'check_background_agent',
      output: [
        {
          type: 'json',
          value: {
            jobId: 'bg-agent-1',
            status: 'completed',
            newChunks: [],
            result: {
              type: 'lastMessage',
              value: [
                {
                  role: 'assistant',
                  content: [{ type: 'text', text: 'done' }],
                },
              ],
            },
          },
        },
      ],
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({
      type: 'agent',
      status: 'complete',
      backgroundJobId: 'bg-agent-1',
    })
  })

  test('[ERR-H01] terminal cancellation is immutable when a late result arrives', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'tool_call',
      toolCallId: 'tool-1',
      toolName: 'read_files',
      input: { paths: ['a.ts'] },
    } as any)
    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      blocks.map((block) =>
        block.type === 'tool'
          ? { ...block, lifecycle: 'cancelled' as const }
          : block,
      ),
    )
    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'read_files',
      output: [{ type: 'json', value: { ok: true } }],
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({
      type: 'tool',
      lifecycle: 'cancelled',
    })
  })

  test('[COR-H03] any error part makes the terminal tool lifecycle failed', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'tool_call',
      toolCallId: 'tool-2',
      toolName: 'apply_patch',
      input: {},
    } as any)
    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-2',
      toolName: 'apply_patch',
      output: [
        { type: 'json', value: { applied: true } },
        { type: 'json', value: { errorMessage: 'post-commit report failed' } },
      ],
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({ lifecycle: 'failed' })
  })

  test('late canonical mutation result replaces cancellation with authoritative state', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'tool_call',
      toolCallId: 'tool-late',
      toolName: 'write_file',
      input: { path: 'a.ts' },
    } as any)
    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      blocks.map((block) =>
        block.type === 'tool'
          ? { ...block, lifecycle: 'cancelled' as const }
          : block,
      ),
    )
    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-late',
      toolName: 'write_file',
      output: [
        {
          type: 'json',
          value: {
            kind: 'file_mutation_result',
            version: 1,
            operationId: 'op',
            outcome: 'applied',
            authorityTier: 'portable_path',
            actions: [
              {
                actionId: 'a',
                index: 0,
                action: 'create',
                path: 'a.ts',
                outcome: 'applied',
                beforeHash: null,
                afterHash: 'sha256:x',
              },
            ],
            errors: [],
            freshCapabilities: [],
          },
        },
      ],
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({
      lifecycle: 'succeeded',
      interrupted: true,
    })
  })

  test('[ERR-H01] subagent error finishes persist failed status', () => {
    const { ctx, getMessages } = createTestContext()
    let streaming = new Set<string>()
    ctx.streaming.setStreamingAgents = (updater) => {
      streaming = updater(streaming)
    }
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'subagent_start',
      agentId: 'agent-1',
      agentType: 'editor',
      displayName: 'Editor',
      onlyChild: false,
    } as any)
    handleEvent({
      type: 'tool_call',
      toolCallId: 'nested-tool-1',
      toolName: 'edit_transaction',
      input: { edits: [] },
      agentId: 'agent-1',
      parentAgentId: 'agent-1',
    } as any)
    expect(streaming.has('nested-tool-1')).toBe(true)
    handleEvent({
      type: 'subagent_finish',
      agentId: 'agent-1',
      agentType: 'editor',
      displayName: 'Editor',
      onlyChild: false,
      error: 'timed out',
    } as any)
    expect(getMessages()[0].blocks?.[0]).toMatchObject({ status: 'failed' })
    expect((getMessages()[0].blocks?.[0] as any).blocks?.[0]).toMatchObject({
      type: 'tool',
      lifecycle: 'failed',
    })
    expect(streaming.has('agent-1')).toBe(false)
    expect(streaming.has('nested-tool-1')).toBe(false)
  })

  test('root finish settles orphaned foreground agent cards', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'subagent_start',
      agentId: 'orphan-editor',
      agentType: 'editor',
      displayName: 'Editor',
      onlyChild: true,
    } as any)

    expect(getMessages()[0].blocks?.[0]).toMatchObject({ status: 'running' })

    handleEvent({ type: 'finish', totalCost: 0 } as any)

    expect(getMessages()[0].blocks?.[0]).toMatchObject({ status: 'failed' })
  })

  test('root finish fails unresolved foreground tools but preserves live background tools', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'tool_call',
      toolCallId: 'root-running-tool',
      toolName: 'read_files',
      input: { paths: ['a.ts'] },
    } as any)
    handleEvent({
      type: 'subagent_start',
      agentId: 'background-agent',
      agentType: 'researcher-web',
      displayName: 'Researcher',
      onlyChild: false,
    } as any)
    ctx.message.updater.updateAiMessageBlocks((blocks) =>
      blocks.map((block) =>
        block.type === 'agent' && block.agentId === 'background-agent'
          ? {
              ...block,
              backgroundJobId: 'bg-1',
              blocks: [
                {
                  type: 'tool' as const,
                  toolCallId: 'background-running-tool',
                  toolName: 'web_search' as any,
                  input: {},
                  lifecycle: 'running' as const,
                },
              ],
            }
          : block,
      ),
    )

    handleEvent({ type: 'finish', totalCost: 0 } as any)

    const blocks = getMessages()[0].blocks ?? []
    expect(blocks.find((block) => block.type === 'tool')).toMatchObject({
      toolCallId: 'root-running-tool',
      lifecycle: 'failed',
    })
    const background = blocks.find(
      (block) => block.type === 'agent' && block.agentId === 'background-agent',
    ) as any
    expect(background).toMatchObject({
      status: 'running',
      backgroundJobId: 'bg-1',
    })
    expect(background.blocks[0]).toMatchObject({ lifecycle: 'running' })
  })

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

  test('keeps the last context usage after finish', () => {
    const captured: Array<{ used: number; max: number } | null> = []
    const { ctx } = createTestContext()
    ctx.streaming.setContextWindowUsage = (usage) => captured.push(usage)
    const handleEvent = createEventHandler(ctx)

    handleEvent({ type: 'context_window', used: 150000, max: 200000 })
    handleEvent({ type: 'finish', totalCost: 0 } as any)

    expect(captured).toEqual([{ used: 150000, max: 200000 }])
  })

  test('persists context compaction details in the assistant message', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    const categories = {
      toolResults: { tokens: 10, percent: 10, messages: 1 },
      todos: { tokens: 10, percent: 10, messages: 1 },
      fileReads: { tokens: 20, percent: 20, messages: 2 },
      subagents: { tokens: 20, percent: 20, messages: 2 },
      userAssistantMessages: { tokens: 40, percent: 40, messages: 4 },
    }

    handleEvent({
      type: 'context_compaction',
      action: 'mechanical_trim',
      before: { tokens: 190000, messages: 20, categories },
      after: { tokens: 120000, messages: 12, categories },
      removedCategories: ['toolResults', 'fileReads'],
      retainedKnowledgeMemory: false,
      recovery: 'Re-read exact files before editing.',
    })

    const text = getMessages()[0].blocks?.find(
      (block) => block.type === 'text' && block.content.includes('context'),
    )
    const content = String(text?.type === 'text' ? text.content : '')
    expect(text?.type).toBe('text')
    expect(content).toContain('190,000 → 120,000 tokens')
    expect(content).toContain('Removed: toolResults, fileReads')
    expect(content).toContain('Retained knowledge memory: no')
  })
})
