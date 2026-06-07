import { describe, expect, test } from 'bun:test'

import { createAgentBlock } from '../message-block-helpers'
import { createMessageUpdater } from '../message-updater'
import {
  createEventHandler,
  createStreamChunkHandler,
} from '../sdk-event-handlers'

import type { StreamStatus } from '../../hooks/use-message-queue'
import type { AgentContentBlock, ChatMessage } from '../../types/chat'
import type { AgentMode } from '../constants'
import type { EventHandlerState } from '../sdk-event-handlers'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import { getFileStatsFromBlocks } from '../implementor-helpers'

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
      value: any
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

  test('matches underscore direct-tool aliases to hyphenated agent ids', () => {
    const { ctx, getMessages, getStreamingAgents } = createTestContext()
    const handleEvent = createEventHandler(ctx)
    const handleChunk = createStreamChunkHandler(ctx)

    handleEvent({
      type: 'tool_call',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'code_reviewer_lite',
            prompt: 'Review this change',
          },
        ],
      },
      agentId: 'main-agent',
      parentAgentId: undefined,
    } as any)

    handleEvent({
      type: 'subagent_start',
      agentId: 'agent-real',
      agentType: 'code-reviewer-lite',
      displayName: 'Code Reviewer Lite',
      onlyChild: true,
      parentAgentId: undefined,
      params: undefined,
      prompt: 'Review this change',
    })

    handleChunk({
      type: 'subagent_chunk',
      agentId: 'agent-real',
      agentType: 'code-reviewer-lite',
      chunk: 'streamed review',
    })

    handleEvent({
      type: 'subagent_finish',
      agentId: 'agent-real',
      agentType: 'code-reviewer-lite',
      displayName: 'Code Reviewer Lite',
      onlyChild: true,
      parentAgentId: undefined,
      params: undefined,
      prompt: 'Review this change',
    })

    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentName: 'code-reviewer-lite',
              agentType: 'code-reviewer-lite',
              value: 'streamed review',
            },
          ],
        },
      ],
    } as any)

    const blocks = getMessages()[0].blocks ?? []
    expect(blocks).toHaveLength(1)
    const agentBlock = blocks[0] as AgentContentBlock
    expect(agentBlock.agentId).toBe('agent-real')
    expect(agentBlock.agentName).toBe('code-reviewer-lite')
    expect(agentBlock.agentType).toBe('code-reviewer-lite')
    expect(agentBlock.status).toBe('complete')
    expect(agentBlock.blocks).toHaveLength(1)
    expect(agentBlock.blocks?.[0]).toMatchObject({
      type: 'text',
      content: 'streamed review',
    })
    expect(getStreamingAgents().size).toBe(0)
  })

  test('preserves spawn_agents params on placeholder agent blocks', () => {
    const { ctx, getMessages, getStreamingAgents } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    handleEvent({
      type: 'tool_call',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'basher',
            params: {
              command: 'git status --short',
              what_to_summarize: 'Report whether the worktree is clean',
            },
          },
        ],
      },
      agentId: 'main-agent',
      parentAgentId: undefined,
    } as any)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.agentId).toBe('tool-1-0')
    expect(agentBlock.agentType).toBe('basher')
    expect(agentBlock.initialPrompt).toBe('')
    expect(agentBlock.params).toEqual({
      command: 'git status --short',
      what_to_summarize: 'Report whether the worktree is clean',
    })
    expect(getStreamingAgents().has('tool-1-0')).toBe(true)
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

  test('handles spawn_agents tool results for agents with tool blocks (lastMessage mode)', () => {
    const { ctx, getMessages, getStreamingAgents } = createTestContext()

    // Create an agent block with an existing tool block (simulating thinker agent's read_files)
    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'tool-1-0',
        agentName: 'Thinker',
        agentType: 'thinker',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'tool',
            toolCallId: 'read-1',
            toolName: 'read_files',
            input: { paths: ['package.json'] },
            output: 'package contents',
          },
        ],
        initialPrompt: 'Think about this',
        spawnToolCallId: 'tool-1',
        spawnIndex: 0,
      } as any,
    ])
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
              agentName: 'thinker',
              value: {
                type: 'lastMessage',
                value: [
                  {
                    role: 'assistant',
                    content: [
                      { type: 'text', text: 'Here is the analysis result.' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    handleEvent(toolResultEvent)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')
    // Should have the tool block AND the final text content
    expect(agentBlock.blocks).toHaveLength(2)
    expect(agentBlock.blocks?.[0]).toMatchObject({
      type: 'tool',
      toolName: 'read_files',
    })
    expect(agentBlock.blocks?.[1]).toMatchObject({
      type: 'text',
      content: 'Here is the analysis result.',
    })
    expect(getStreamingAgents().size).toBe(0)
  })

  test('synthesizes edit blocks for proposal agents that streamed no tool blocks', () => {
    const { ctx, getMessages } = createTestContext()

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'tool-1-0',
        agentName: 'Proposal #2',
        agentType: 'editor-implementor-proposal-2',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: 'Make the edits',
        spawnToolCallId: 'tool-1',
        spawnIndex: 0,
      } as any,
    ])
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
              agentName: 'editor-implementor-proposal-2',
              value: {
                toolCalls: [
                  {
                    toolName: 'propose_str_replace',
                    input: {
                      path: 'docs/agents-and-tools.md',
                      replacements: [{ oldString: 'old', newString: 'new' }],
                    },
                  },
                ],
                toolResults: [
                  [
                    {
                      file: 'docs/agents-and-tools.md',
                      unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
                    },
                  ],
                ],
                unifiedDiffs: '',
              },
            },
          ],
        },
      ],
    }
    handleEvent(toolResultEvent)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')
    const toolBlocks = (agentBlock.blocks ?? []).filter(
      (b) => b.type === 'tool',
    )
    expect(toolBlocks).toHaveLength(1)
    expect(toolBlocks[0]).toMatchObject({
      type: 'tool',
      toolName: 'propose_str_replace',
      input: { path: 'docs/agents-and-tools.md' },
    })
  })

  test('synthesizes edit blocks from structuredOutput-wrapped proposal results', () => {
    const { ctx, getMessages } = createTestContext()

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'tool-1-0',
        agentName: 'Proposal #3',
        agentType: 'editor-implementor-proposal-3',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: 'Make the edits',
        spawnToolCallId: 'tool-1',
        spawnIndex: 0,
      } as any,
    ])
    ctx.streaming.setStreamingAgents(() => new Set(['tool-1-0']))

    const handleEvent = createEventHandler(ctx)
    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentName: 'editor-implementor-proposal-3',
              value: {
                type: 'structuredOutput',
                value: {
                  value: {
                    toolCalls: [
                      {
                        toolName: 'propose_str_replace',
                        input: {
                          path: 'docs/local-mode.md',
                          replacements: [
                            { oldString: 'old', newString: 'new' },
                          ],
                        },
                      },
                    ],
                    toolResults: [
                      [
                        {
                          file: 'docs/local-mode.md',
                          unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
                        },
                      ],
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    } as any)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')
    const toolBlocks = (agentBlock.blocks ?? []).filter(
      (b) => b.type === 'tool',
    )
    expect(toolBlocks).toHaveLength(1)
    expect(toolBlocks[0]).toMatchObject({
      type: 'tool',
      toolName: 'propose_str_replace',
      input: { path: 'docs/local-mode.md' },
    })
  })

  test('attaches proposal results to real subagent blocks by agent id', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    handleEvent({
      type: 'subagent_start',
      agentId: 'agent-real',
      agentType: 'editor-implementor-proposal-1',
      displayName: 'Proposal #1',
      onlyChild: false,
      parentAgentId: undefined,
      params: { proposalLabel: 'Proposal #1' },
      prompt: 'Make the edits',
    })

    handleEvent({
      type: 'subagent_finish',
      agentId: 'agent-real',
      agentType: 'editor-implementor-proposal-1',
      displayName: 'Proposal #1',
      onlyChild: false,
      parentAgentId: undefined,
      params: { proposalLabel: 'Proposal #1' },
      prompt: 'Make the edits',
    })

    handleEvent({
      type: 'tool_result',
      toolCallId: 'tool-1',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentId: 'agent-real',
              agentName: 'Proposal #1',
              agentType: 'editor-implementor-proposal-1',
              value: {
                type: 'structuredOutput',
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'cli/src/utils/arrays.ts',
                        replacements: [
                          { oldString: 'old queue', newString: 'new queue' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    [
                      {
                        file: 'cli/src/utils/arrays.ts',
                        unifiedDiff:
                          '@@ -1 +1 @@\n-old queue\n+new queue',
                      },
                    ],
                  ],
                },
              },
            },
          ],
        },
      ],
    } as any)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.agentId).toBe('agent-real')
    expect(agentBlock.spawnToolCallId).toBeUndefined()
    expect(agentBlock.status).toBe('complete')

    const toolBlocks = (agentBlock.blocks ?? []).filter(
      (b) => b.type === 'tool',
    )
    expect(toolBlocks).toHaveLength(1)
    expect(toolBlocks[0]).toMatchObject({
      type: 'tool',
      toolName: 'propose_str_replace',
      input: { path: 'cli/src/utils/arrays.ts' },
    })
  })

  test('merges final proposal diffs when a partial live edit block already exists', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'proposal-agent-1',
        agentName: 'Proposal #1',
        agentType: 'editor-implementor-proposal-1',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'tool',
            toolCallId: 'partial-live-proposal-tool',
            toolName: 'propose_str_replace',
            input: {},
            agentId: 'proposal-agent-1',
            includeToolCall: false,
          },
        ],
        initialPrompt: 'Make the edits',
      } as any,
    ])

    handleEvent({
      type: 'tool_result',
      toolCallId: 'spawn-proposals',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentId: 'proposal-agent-1',
              agentName: 'Proposal #1',
              agentType: 'editor-implementor-proposal-1',
              value: {
                type: 'structuredOutput',
                value: {
                  toolCalls: [
                    {
                      toolName: 'propose_str_replace',
                      input: {
                        path: 'tmp-multieditor-live/notes.ts',
                        replacements: [
                          { oldString: 'before', newString: 'after' },
                        ],
                      },
                    },
                  ],
                  toolResults: [
                    [
                      {
                        file: 'tmp-multieditor-live/notes.ts',
                        unifiedDiff: '@@ -1 +1 @@\n-before\n+after',
                      },
                    ],
                  ],
                },
              },
            },
          ],
        },
      ],
    } as any)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')

    const toolBlocks = (agentBlock.blocks ?? []).filter(
      (block) => block.type === 'tool',
    )
    expect(toolBlocks).toHaveLength(2)

    const stats = getFileStatsFromBlocks(agentBlock.blocks)
    expect(stats).toEqual([
      {
        path: 'tmp-multieditor-live/notes.ts',
        changeType: 'M',
        stats: { linesAdded: 1, linesRemoved: 1, hunks: 1 },
      },
    ])
  })

  test('repairs empty multi-prompt proposal cards from parent summary render data', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'multi-temp',
        agentName: 'Multi-Prompt Editor',
        agentType: 'editor-multi-prompt',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'proposal-real-2',
            agentName: 'Proposal #2',
            agentType: 'editor-implementor-proposal-direct',
            content: '',
            status: 'complete',
            blocks: [],
            initialPrompt: 'Minimal edit',
            params: { proposalLabel: 'Proposal #2' },
          },
        ],
        initialPrompt: 'Run best of N',
        spawnToolCallId: 'root-spawn',
        spawnIndex: 0,
      } as any,
    ])

    handleEvent({
      type: 'tool_result',
      toolCallId: 'root-spawn',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentId: 'multi-real',
              agentName: 'Multi-Prompt Editor',
              agentType: 'editor-multi-prompt',
              value: {
                type: 'structuredOutput',
                value: {
                  chosenStrategy: 'Minimal edit',
                  reason: 'It prepends the requested comment.',
                  proposalSummary: {
                    selected: { id: 'B', label: 'Proposal #2' },
                    applied: { id: 'B', label: 'Proposal #2' },
                    proposals: [
                      {
                        id: 'B',
                        label: 'Proposal #2',
                        strategy: 'Minimal edit',
                        status: 'usable',
                        toolCalls: [
                          {
                            toolName: 'propose_str_replace',
                            input: {
                              path: 'tmp-multieditor-live/notes.ts',
                              replacements: [
                                {
                                  oldString: "export const status = 'before'",
                                  newString:
                                    "// multi editor smoke test\nexport const status = 'before'",
                                },
                              ],
                            },
                          },
                        ],
                        toolResults: [
                          {
                            file: 'tmp-multieditor-live/notes.ts',
                            unifiedDiff:
                              "@@ -1,4 +1,5 @@\n+// multi editor smoke test\n export const status = 'before'",
                          },
                        ],
                        unifiedDiffs:
                          "--- tmp-multieditor-live/notes.ts ---\n@@ -1,4 +1,5 @@\n+// multi editor smoke test\n export const status = 'before'",
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    } as any)

    const multiPromptBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(multiPromptBlock.status).toBe('complete')

    const proposalBlocks = (multiPromptBlock.blocks ?? []).filter(
      (block): block is AgentContentBlock =>
        block.type === 'agent' && block.agentName === 'Proposal #2',
    )
    expect(proposalBlocks).toHaveLength(1)
    expect(getFileStatsFromBlocks(proposalBlocks[0].blocks)).toEqual([
      {
        path: 'tmp-multieditor-live/notes.ts',
        changeType: 'M',
        stats: { linesAdded: 1, linesRemoved: 0, hunks: 1 },
      },
    ])
  })

  test('repairs unlabeled direct proposal cards from parent summary order', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'multi-temp',
        agentName: 'Multi-Prompt Editor',
        agentType: 'editor-multi-prompt',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'proposal-real-1',
            agentName: 'Sonnet',
            agentType: 'editor-implementor-proposal-direct',
            content: '',
            status: 'complete',
            blocks: [],
            initialPrompt: 'Add first marker',
          },
          {
            type: 'agent',
            agentId: 'proposal-real-2',
            agentName: 'Sonnet',
            agentType: 'editor-implementor-proposal-direct',
            content: '',
            status: 'complete',
            blocks: [],
            initialPrompt: 'Add second marker',
          },
        ],
        initialPrompt: 'Run best of N',
        spawnToolCallId: 'root-spawn',
        spawnIndex: 0,
      } as any,
    ])

    handleEvent({
      type: 'tool_result',
      toolCallId: 'root-spawn',
      toolName: 'spawn_agents',
      output: [
        {
          type: 'json',
          value: [
            {
              agentId: 'multi-real',
              agentName: 'Multi-Prompt Editor',
              agentType: 'editor-multi-prompt',
              value: {
                type: 'structuredOutput',
                value: {
                  proposalSummary: {
                    selected: { id: 'B', label: 'Proposal #2' },
                    applied: { id: 'B', label: 'Proposal #2' },
                    proposals: [
                      {
                        id: 'A',
                        label: 'Proposal #1',
                        strategy: 'Add first marker',
                        status: 'usable',
                        toolCalls: [
                          {
                            toolName: 'propose_str_replace',
                            input: {
                              path: 'tmp-multieditor-live/notes.ts',
                              replacements: [
                                {
                                  oldString: "export const status = 'before'",
                                  newString:
                                    "// first proposal\nexport const status = 'before'",
                                },
                              ],
                            },
                          },
                        ],
                        toolResults: [
                          {
                            file: 'tmp-multieditor-live/notes.ts',
                            unifiedDiff:
                              "@@ -1,4 +1,5 @@\n+// first proposal\n export const status = 'before'",
                          },
                        ],
                        unifiedDiffs:
                          "--- tmp-multieditor-live/notes.ts ---\n@@ -1,4 +1,5 @@\n+// first proposal\n export const status = 'before'",
                      },
                      {
                        id: 'B',
                        label: 'Proposal #2',
                        strategy: 'Add second marker',
                        status: 'usable',
                        toolCalls: [
                          {
                            toolName: 'propose_str_replace',
                            input: {
                              path: 'tmp-multieditor-live/notes.ts',
                              replacements: [
                                {
                                  oldString: "export const status = 'before'",
                                  newString:
                                    "// second proposal\nexport const status = 'before'",
                                },
                              ],
                            },
                          },
                        ],
                        toolResults: [
                          {
                            file: 'tmp-multieditor-live/notes.ts',
                            unifiedDiff:
                              "@@ -1,4 +1,5 @@\n+// second proposal\n export const status = 'before'",
                          },
                        ],
                        unifiedDiffs:
                          "--- tmp-multieditor-live/notes.ts ---\n@@ -1,4 +1,5 @@\n+// second proposal\n export const status = 'before'",
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      ],
    } as any)

    const multiPromptBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    const proposalBlocks = (multiPromptBlock.blocks ?? []).filter(
      (block): block is AgentContentBlock =>
        block.type === 'agent' &&
        block.agentType === 'editor-implementor-proposal-direct',
    )

    expect(proposalBlocks).toHaveLength(2)
    expect(proposalBlocks.map((block) => block.agentName)).toEqual([
      'Proposal #1',
      'Proposal #2',
    ])
    expect(proposalBlocks.map((block) => block.params?.proposalOrdinal)).toEqual(
      [1, 2],
    )
    expect(getFileStatsFromBlocks(proposalBlocks[0].blocks)).toEqual([
      {
        path: 'tmp-multieditor-live/notes.ts',
        changeType: 'M',
        stats: { linesAdded: 1, linesRemoved: 0, hunks: 1 },
      },
    ])
    expect(getFileStatsFromBlocks(proposalBlocks[1].blocks)).toEqual([
      {
        path: 'tmp-multieditor-live/notes.ts',
        changeType: 'M',
        stats: { linesAdded: 1, linesRemoved: 0, hunks: 1 },
      },
    ])
  })

  test('shows live proposal diffs before the multi-prompt parent finishes', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'multi-real',
        agentName: 'Multi-Prompt Editor',
        agentType: 'editor-multi-prompt',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'agent',
            agentId: 'proposal-real-1',
            agentName: 'Proposal #1',
            agentType: 'editor-implementor-proposal-direct',
            content: '',
            status: 'running',
            blocks: [],
            initialPrompt: 'Add marker',
            params: { proposalLabel: 'Proposal #1', proposalOrdinal: 1 },
          },
        ],
        initialPrompt: 'Run best of N',
      } as any,
    ])

    handleEvent({
      type: 'tool_call',
      toolCallId: 'proposal-tool-1',
      toolName: 'propose_write_file',
      agentId: 'proposal-real-1',
      parentAgentId: 'multi-real',
      includeToolCall: false,
      input: {
        path: 'tmp-multieditor-live/notes.ts',
        content:
          "//Checking the proposal card display\nexport const status = 'before'\n",
      },
    } as any)

    handleEvent({
      type: 'tool_result',
      toolCallId: 'proposal-tool-1',
      toolName: 'propose_write_file',
      agentId: 'proposal-real-1',
      parentAgentId: 'multi-real',
      output: [
        {
          type: 'json',
          value: {
            file: 'tmp-multieditor-live/notes.ts',
            message: 'Proposed changes to tmp-multieditor-live/notes.ts',
            unifiedDiff:
              "@@ -1,1 +1,2 @@\n+//Checking the proposal card display\n export const status = 'before'",
          },
        },
      ],
    } as any)

    const multiPromptBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    const proposalBlock = (multiPromptBlock.blocks ?? [])[0] as AgentContentBlock
    expect(getFileStatsFromBlocks(proposalBlock.blocks)).toEqual([
      {
        path: 'tmp-multieditor-live/notes.ts',
        changeType: 'M',
        stats: { linesAdded: 1, linesRemoved: 0, hunks: 1 },
      },
    ])
  })

  test('attaches live result-only proposal edit blocks by agent id', () => {
    const { ctx, getMessages } = createTestContext()
    const handleEvent = createEventHandler(ctx)

    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'proposal-agent-1',
        agentName: 'Proposal #1',
        agentType: 'editor-implementor-proposal-1',
        content: '',
        status: 'running',
        blocks: [],
        initialPrompt: 'Make the edits',
      } as any,
    ])

    handleEvent({
      type: 'tool_result',
      toolCallId: 'proposal-tool-1',
      toolName: 'propose_str_replace',
      agentId: 'proposal-agent-1',
      parentAgentId: 'editor-agent-1',
      output: [
        {
          type: 'json',
          value: {
            file: 'tmp-multieditor-live/notes.ts',
            message: 'Proposed string replacement.',
            unifiedDiff: '@@ -1 +1 @@\n-old\n+new',
          },
        },
      ],
    } as any)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    const toolBlocks = (agentBlock.blocks ?? []).filter(
      (block) => block.type === 'tool',
    )

    expect(toolBlocks).toHaveLength(1)
    expect(toolBlocks[0]).toMatchObject({
      type: 'tool',
      toolCallId: 'proposal-tool-1',
      toolName: 'propose_str_replace',
      agentId: 'proposal-agent-1',
      input: {},
    })

    const stats = getFileStatsFromBlocks(agentBlock.blocks)
    expect(stats).toHaveLength(1)
    expect(stats[0]).toMatchObject({
      path: 'tmp-multieditor-live/notes.ts',
      changeType: 'M',
      stats: { linesAdded: 1, linesRemoved: 1, hunks: 1 },
    })
  })

  test('preserves streamed text content and skips duplicate final content', () => {
    const { ctx, getMessages, getStreamingAgents } = createTestContext()

    // Create an agent block with existing text blocks (simulating streamed output like basher)
    ctx.message.updater.updateAiMessageBlocks(() => [
      {
        type: 'agent',
        agentId: 'tool-1-0',
        agentName: 'Basher',
        agentType: 'basher',
        content: '',
        status: 'running',
        blocks: [
          {
            type: 'text',
            content: 'Streamed output from basher',
            textType: 'text',
          },
        ],
        initialPrompt: 'Run a command',
        spawnToolCallId: 'tool-1',
        spawnIndex: 0,
      } as any,
    ])
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
              agentName: 'basher',
              value: {
                type: 'lastMessage',
                value: [
                  {
                    role: 'assistant',
                    content: [
                      { type: 'text', text: 'Streamed output from basher' },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    }
    handleEvent(toolResultEvent)

    const agentBlock = (getMessages()[0].blocks ?? [])[0] as AgentContentBlock
    expect(agentBlock.status).toBe('complete')
    // Should NOT duplicate the streamed text — only the original text block
    expect(agentBlock.blocks).toHaveLength(1)
    expect(agentBlock.blocks?.[0]).toMatchObject({
      type: 'text',
      content: 'Streamed output from basher',
    })
    expect(getStreamingAgents().size).toBe(0)
  })
})
