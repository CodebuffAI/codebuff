import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  assistantMessage,
  jsonToolResult,
} from '@codebuff/common/util/messages'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import * as runAgentStep from '../run-agent-step'
import { mockFileContext } from './test-utils'
import { assembleLocalAgentTemplates } from '../templates/agent-registry'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'
import {
  appendProposalArtifact,
  clearProposalLedgerForRun,
  getProposalLedger,
} from '../tools/handlers/tool/proposal-ledger-store'

import type { AgentTemplate } from '../templates/types'
import type { SendSubagentChunk } from '../tools/handlers/tool/spawn-agents'
import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Mock } from 'bun:test'

describe('Subagent Streaming', () => {
  let mockSendSubagentChunk: Mock<SendSubagentChunk>
  let mockLoopAgentSteps: Mock<(typeof runAgentStep)['loopAgentSteps']>
  let mockAgentTemplate: AgentTemplate
  let mockWriteToClient: Mock<
    Parameters<typeof handleSpawnAgents>[0]['writeToClient']
  >
  let handleSpawnAgentsBaseParams: ParamsExcluding<
    typeof handleSpawnAgents,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >

  beforeEach(() => {
    // Setup common mock agent template
    mockAgentTemplate = {
      id: 'thinker',
      displayName: 'Thinker',
      outputMode: 'last_message',
      inputSchema: {
        prompt: {
          safeParse: () => ({ success: true }),
        } as unknown as AgentTemplate['inputSchema']['prompt'],
      },
      spawnerPrompt: '',
      model: '',
      includeMessageHistory: true,
      inheritParentSystemPrompt: false,
      toolNames: [],
      spawnableAgents: [],
      systemPrompt: '',
      instructionsPrompt: '',
      stepPrompt: '',
      mcpServers: {},
    }

    handleSpawnAgentsBaseParams = {
      ...TEST_AGENT_RUNTIME_IMPL,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      previousToolCallFinished: Promise.resolve(),
      repoId: undefined,
      repoUrl: undefined,
      sendSubagentChunk: mockSendSubagentChunk,
      signal: new AbortController().signal,
      system: 'Test system prompt',
      tools: {},
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient: mockWriteToClient,
    }
  })

  beforeAll(() => {
    // Mock sendSubagentChunk function to capture streaming messages
    mockSendSubagentChunk = mock(() => {})

    // Mock loopAgentSteps to simulate subagent execution with streaming
    mockLoopAgentSteps = spyOn(
      runAgentStep,
      'loopAgentSteps',
    ).mockImplementation(async (options) => {
      // Simulate streaming chunks by calling the callback
      if (options.onResponseChunk) {
        options.onResponseChunk('Thinking about the problem...')
        options.onResponseChunk('Found a solution!')
      }

      return {
        agentState: {
          ...options.agentState,
          messageHistory: [assistantMessage('Test response from subagent')],
        },
        output: {
          type: 'lastMessage',
          value: [assistantMessage('Test response from subagent')],
        },
      }
    })

    mockWriteToClient = mock(() => {})

    // Mock assembleLocalAgentTemplates
    spyOn(
      { assembleLocalAgentTemplates },
      'assembleLocalAgentTemplates',
    ).mockImplementation(() => ({
      agentTemplates: {
        [mockAgentTemplate.id]: mockAgentTemplate,
      },
      validationErrors: [],
    }))
  })

  beforeEach(() => {
    mockSendSubagentChunk.mockClear()
    mockLoopAgentSteps.mockClear()
    mockWriteToClient.mockClear()
  })

  afterAll(() => {
    mock.restore()
  })

  it('should send subagent-response-chunk messages during agent execution', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    // Mock parent agent template that can spawn thinker
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['thinker'],
    } as unknown as AgentTemplate

    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents' as const,
      toolCallId: 'test-tool-call-id',
      input: {
        agents: [
          {
            agent_type: 'thinker',
            prompt: 'Think about this problem',
          },
        ],
      },
    }

    await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: {
        [mockAgentTemplate.id]: mockAgentTemplate,
      },
      toolCall,
    })

    // Verify that subagent streaming messages were sent
    expect(mockWriteToClient).toHaveBeenCalledTimes(2)

    // First call is subagent_start
    expect(mockWriteToClient).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'subagent_start' }),
    )

    // Second call is subagent_finish
    expect(mockWriteToClient).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'subagent_finish' }),
    )
    return
  })

  it('expands a single editor-multi-prompt strategy before starting the child agent', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    const editorMultiPromptTemplate = {
      ...mockAgentTemplate,
      id: 'editor-multi-prompt',
      displayName: 'Multi-Prompt Editor',
      inputSchema: {
        params: {
          safeParse: (value: any) => ({
            success:
              Array.isArray(value?.prompts) && value.prompts.length === 3,
          }),
        } as unknown as AgentTemplate['inputSchema']['params'],
      },
    } as AgentTemplate
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['editor-multi-prompt'],
    } as unknown as AgentTemplate

    await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: {
        [editorMultiPromptTemplate.id]: editorMultiPromptTemplate,
      },
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'single-multi-prompt-spawn',
        input: {
          agents: [
            {
              agent_type: 'editor-multi-prompt',
              prompt: 'Make the edit',
              params: {
                prompts: ['Add the requested comment'],
              },
            },
          ],
        },
      },
    })

    const spawnParams = mockLoopAgentSteps.mock.calls[0][0].spawnParams as any
    expect(spawnParams.prompts).toHaveLength(3)
    expect(spawnParams.prompts[0]).toContain('Add the requested comment')
    expect(spawnParams.prompts[1]).toContain('re-anchor')
    expect(spawnParams.prompts[2]).toContain('robust full-file')
    expect(spawnParams.originalPromptCount).toBe(1)
    expect(spawnParams.expandedPromptCount).toBe(3)

    const startEvent = mockWriteToClient.mock.calls
      .map((call) => call[0])
      .find(
        (event) => typeof event === 'object' && event.type === 'subagent_start',
      )
    expect(startEvent).toMatchObject({
      type: 'subagent_start',
      agentType: 'editor-multi-prompt',
      params: {
        prompts: expect.arrayContaining([
          expect.stringContaining('smallest localized edit'),
          expect.stringContaining('re-anchor'),
          expect.stringContaining('robust full-file'),
        ]),
      },
    })
  })

  it('streams snapshotted ledger-backed proposal tool events before proposal subagent finish', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    const proposalTemplate = {
      ...mockAgentTemplate,
      id: 'editor-implementor-proposal-1',
      displayName: 'Proposal 1',
      includeMessageHistory: false,
      toolNames: ['propose_write_file'],
    } as AgentTemplate
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['editor-implementor-proposal-1'],
    } as unknown as AgentTemplate

    mockLoopAgentSteps.mockImplementationOnce(async (options) => {
      options.agentState.runId = 'proposal-stream-test-run'
      appendProposalArtifact(options.agentState.runId, {
        toolName: 'propose_write_file',
        input: {
          path: 'tmp-multieditor-live/notes.ts',
          content: "export const status = 'after'\n",
        },
        result: {
          file: 'tmp-multieditor-live/notes.ts',
          ok: true,
          unifiedDiff: '@@\n-before\n+after',
          message: 'Proposed changes to tmp-multieditor-live/notes.ts',
          finalContent: "export const status = 'after'\n",
          baseContentHash: 'base-hash',
          baseContent: "export const status = 'before'\n",
        },
      })
      ;(options.agentState as any).proposalLedger = getProposalLedger(
        options.agentState.runId,
      )
      clearProposalLedgerForRun(options.agentState.runId)

      return {
        agentState: {
          ...options.agentState,
          messageHistory: [
            assistantMessage({
              type: 'tool-call',
              toolCallId: 'embedded-proposal-call',
              toolName: 'propose_write_file',
              input: {
                path: 'tmp-multieditor-live/notes.ts',
                content: "export const status = 'after'\n",
              },
            }),
            {
              role: 'tool',
              toolCallId: 'embedded-proposal-call',
              toolName: 'propose_write_file',
              content: jsonToolResult({
                file: 'tmp-multieditor-live/notes.ts',
                unifiedDiff: '@@\n-before\n+after',
              }),
            },
          ],
        },
        output: {
          type: 'lastMessage',
          value: [assistantMessage('PROPOSAL_BUNDLE_COMPLETE')],
        },
      }
    })

    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'proposal-spawn-call-id',
      input: {
        agents: [
          {
            agent_type: 'editor-implementor-proposal-1',
            prompt: 'Propose a change',
          },
        ],
      },
    }

    await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: {
        [proposalTemplate.id]: proposalTemplate,
      },
      toolCall,
    })

    const events = mockWriteToClient.mock.calls.map((call) => call[0])
    const toolCallEventIndex = events.findIndex(
      (event) =>
        typeof event === 'object' &&
        event.type === 'tool_call' &&
        event.toolName === 'propose_write_file',
    )
    const toolResultEventIndex = events.findIndex(
      (event) =>
        typeof event === 'object' &&
        event.type === 'tool_result' &&
        event.toolName === 'propose_write_file',
    )
    const finishEventIndex = events.findIndex(
      (event) => typeof event === 'object' && event.type === 'subagent_finish',
    )

    expect(toolCallEventIndex).toBeGreaterThan(-1)
    expect(toolResultEventIndex).toBeGreaterThan(toolCallEventIndex)
    expect(finishEventIndex).toBeGreaterThan(toolResultEventIndex)

    const toolCallEvent = events[toolCallEventIndex]
    const toolResultEvent = events[toolResultEventIndex]
    const startEvent = events.find(
      (event) => typeof event === 'object' && event.type === 'subagent_start',
    )
    if (
      typeof toolCallEvent !== 'object' ||
      typeof toolResultEvent !== 'object' ||
      typeof startEvent !== 'object'
    ) {
      throw new Error('Expected object events')
    }

    expect(toolCallEvent).toMatchObject({
      agentId: startEvent.agentId,
      parentAgentId: agentState.agentId,
      includeToolCall: false,
      input: expect.objectContaining({
        __proposalFinalContent: "export const status = 'after'\n",
      }),
    })
    expect(toolResultEvent).toMatchObject({
      agentId: startEvent.agentId,
      parentAgentId: agentState.agentId,
      output: [
        {
          type: 'json',
          value: expect.objectContaining({
            file: 'tmp-multieditor-live/notes.ts',
            unifiedDiff: expect.stringContaining('+after'),
          }),
        },
      ],
    })
  })

  it('streams transaction proposal ledger events with transaction-shaped output', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    const proposalTemplate = {
      ...mockAgentTemplate,
      id: 'editor-implementor-proposal-1',
      displayName: 'Proposal 1',
      includeMessageHistory: false,
      toolNames: ['propose_edit_transaction'],
    } as AgentTemplate
    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['editor-implementor-proposal-1'],
    } as unknown as AgentTemplate

    mockLoopAgentSteps.mockImplementationOnce(async (options) => {
      options.agentState.runId = 'proposal-transaction-stream-test-run'
      appendProposalArtifact(options.agentState.runId, {
        toolName: 'propose_edit_transaction',
        input: {
          edits: [
            {
              id: 'update-notes',
              type: 'str_replace',
              path: 'tmp-multieditor-live/notes.ts',
              replacements: [{ oldString: 'before', newString: 'after' }],
            },
          ],
        },
        result: {
          file: 'tmp-multieditor-live/notes.ts',
          ok: true,
          unifiedDiff: '@@\n-before\n+after',
          message: 'Proposed changes to tmp-multieditor-live/notes.ts',
          finalContent: "export const status = 'after'\n",
          baseContentHash: 'base-hash',
          baseContent: "export const status = 'before'\n",
        },
      })
      ;(options.agentState as any).proposalLedger = getProposalLedger(
        options.agentState.runId,
      )
      clearProposalLedgerForRun(options.agentState.runId)

      return {
        agentState: options.agentState,
        output: {
          type: 'lastMessage',
          value: [assistantMessage('PROPOSAL_BUNDLE_COMPLETE')],
        },
      }
    })

    await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: {
        [proposalTemplate.id]: proposalTemplate,
      },
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'proposal-transaction-spawn-call-id',
        input: {
          agents: [
            {
              agent_type: 'editor-implementor-proposal-1',
              prompt: 'Propose a transaction change',
            },
          ],
        },
      },
    })

    const events = mockWriteToClient.mock.calls.map((call) => call[0])
    const toolResultEvent = events.find(
      (event) =>
        typeof event === 'object' &&
        event.type === 'tool_result' &&
        event.toolName === 'propose_edit_transaction',
    )

    expect(toolResultEvent).toMatchObject({
      output: [
        {
          type: 'json',
          value: {
            files: [
              {
                file: 'tmp-multieditor-live/notes.ts',
                unifiedDiff: expect.stringContaining('+after'),
              },
            ],
          },
        },
      ],
    })
  })

  it('should include correct agentId and agentType in streaming messages', async () => {
    const sessionState = getInitialSessionState(mockFileContext)
    const agentState = sessionState.mainAgentState

    const parentTemplate = {
      id: 'base',
      spawnableAgents: ['thinker'],
    } as unknown as AgentTemplate

    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents' as const,
      toolCallId: 'test-tool-call-id-2',
      input: {
        agents: [
          {
            agent_type: 'thinker',
            prompt: 'Test prompt',
          },
        ],
      },
    }

    await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState,
      agentTemplate: parentTemplate,
      localAgentTemplates: {
        [mockAgentTemplate.id]: mockAgentTemplate,
      },
      toolCall,
    })

    // Verify the streaming messages have consistent agentId and correct agentType
    expect(mockSendSubagentChunk.mock.calls.length).toBeGreaterThanOrEqual(2)
    const calls = mockSendSubagentChunk.mock.calls as Array<
      [
        {
          userInputId: string
          agentId: string
          agentType: string
          chunk: string
          prompt?: string
        },
      ]
    >
    const firstCall = calls[0][0]
    const secondCall = calls[1][0]

    expect(firstCall.agentId).toBe(secondCall.agentId) // Same agent ID
    expect(firstCall.agentType).toBe('thinker')
    expect(secondCall.agentType).toBe('thinker')
    expect(firstCall.userInputId).toBe('test-input')
    expect(secondCall.userInputId).toBe('test-input')
  })
})
