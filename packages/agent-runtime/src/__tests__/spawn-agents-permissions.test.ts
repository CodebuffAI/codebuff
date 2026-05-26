import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  mock,
  spyOn,
} from 'bun:test'

import { mockFileContext } from './test-utils'
import * as runAgentStep from '../run-agent-step'
import { handleSpawnAgentInline } from '../tools/handlers/tool/spawn-agent-inline'
import { getMatchingSpawn } from '../tools/handlers/tool/spawn-agent-utils'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

describe('Spawn Agents Permissions', () => {
  let mockSendSubagentChunk: any
  let mockLoopAgentSteps: any
  let handleSpawnAgentsBaseParams: ParamsExcluding<
    typeof handleSpawnAgents,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >
  let handleSpawnAgentInlineBaseParams: ParamsExcluding<
    typeof handleSpawnAgentInline,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >

  const createMockAgent = (
    id: string,
    spawnableAgents: string[] = [],
  ): AgentTemplate => ({
    id,
    displayName: `Mock ${id}`,
    outputMode: 'last_message' as const,
    inputSchema: {
      prompt: {
        safeParse: () => ({ success: true }),
      } as unknown as AgentTemplate['inputSchema']['prompt'],
    },
    spawnerPrompt: '',
    model: '',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents,
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  beforeEach(() => {
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
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient: () => {},
    }

    handleSpawnAgentInlineBaseParams = {
      ...handleSpawnAgentsBaseParams,
      tools: {},
    }

    // Mock sendSubagentChunk
    mockSendSubagentChunk = mock(() => {})

    // Mock loopAgentSteps to avoid actual agent execution
    mockLoopAgentSteps = spyOn(
      runAgentStep,
      'loopAgentSteps',
    ).mockImplementation(async (options) => {
      return {
        agentState: {
          ...options.agentState,
          messageHistory: [assistantMessage('Mock agent response')],
        },
        output: {
          type: 'lastMessage',
          value: [assistantMessage('Mock agent response')],
        },
      }
    })
  })

  afterEach(() => {
    mock.restore()
  })

  describe('getMatchingSpawn function', () => {
    describe('exact matches with publisher/agent@version format', () => {
      it('should match exact publisher/agent@version', () => {
        const spawnableAgents = [
          'codebuff/thinker@1.0.0',
          'codebuff/reviewer@2.1.0',
        ]
        const result = getMatchingSpawn(
          spawnableAgents,
          'codebuff/thinker@1.0.0',
        )
        expect(result).toBe('codebuff/thinker@1.0.0')
      })

      it('should not match different versions', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0']
        const result = getMatchingSpawn(
          spawnableAgents,
          'codebuff/thinker@2.0.0',
        )
        expect(result).toBeNull()
      })

      it('should not match different publishers', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'acme/thinker@1.0.0')
        expect(result).toBeNull()
      })

      it('should not match different agent names', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0']
        const result = getMatchingSpawn(
          spawnableAgents,
          'codebuff/reviewer@1.0.0',
        )
        expect(result).toBeNull()
      })
    })

    describe('publisher/agent format without version', () => {
      it('should match publisher/agent when child has no version', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0', 'acme/reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'codebuff/thinker')
        expect(result).toBe('codebuff/thinker@1.0.0')
      })

      it('should match exact publisher/agent without version', () => {
        const spawnableAgents = ['codebuff/thinker', 'acme/reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'codebuff/thinker')
        expect(result).toBe('codebuff/thinker')
      })

      it('should not match when publisher differs', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'acme/thinker')
        expect(result).toBeNull()
      })
    })

    describe('agent@version format without publisher', () => {
      it('should match agent@version when spawnable has no publisher', () => {
        const spawnableAgents = ['thinker@1.0.0', 'reviewer@2.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'thinker@1.0.0')
        expect(result).toBe('thinker@1.0.0')
      })

      it('should match agent@version when spawnable has publisher but child does not', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0', 'reviewer@2.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'thinker@1.0.0')
        expect(result).toBe('codebuff/thinker@1.0.0')
      })

      it('should not match when versions differ', () => {
        const spawnableAgents = ['thinker@1.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'thinker@2.0.0')
        expect(result).toBeNull()
      })
    })

    describe('simple agent name format', () => {
      it('should match simple agent name', () => {
        const spawnableAgents = ['thinker', 'reviewer', 'file-picker']
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBe('thinker')
      })

      it('should match underscored agent name to hyphenated spawnable agent', () => {
        const spawnableAgents = ['thinker', 'reviewer', 'file-picker']
        const result = getMatchingSpawn(spawnableAgents, 'file_picker')
        expect(result).toBe('file-picker')
      })

      it('should match simple agent name when spawnable has publisher', () => {
        const spawnableAgents = ['codebuff/thinker@1.0.0', 'reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBe('codebuff/thinker@1.0.0')
      })

      it('should match underscored agent name when spawnable has publisher and version', () => {
        const spawnableAgents = ['codebuff/file-picker@1.0.0', 'reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'file_picker')
        expect(result).toBe('codebuff/file-picker@1.0.0')
      })

      it('should match underscored published agent ID to hyphenated spawnable agent', () => {
        const spawnableAgents = ['codebuff/file-picker@1.0.0']
        const result = getMatchingSpawn(
          spawnableAgents,
          'codebuff/file_picker@1.0.0',
        )
        expect(result).toBe('codebuff/file-picker@1.0.0')
      })

      it('should match simple agent name when spawnable has version', () => {
        const spawnableAgents = ['thinker@1.0.0', 'reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBe('thinker@1.0.0')
      })

      it('should not match when agent name differs', () => {
        const spawnableAgents = ['thinker', 'reviewer']
        const result = getMatchingSpawn(spawnableAgents, 'file-picker')
        expect(result).toBeNull()
      })
    })

    describe('edge cases', () => {
      it('should return null for empty agent ID', () => {
        const spawnableAgents = ['thinker', 'reviewer']
        const result = getMatchingSpawn(spawnableAgents, '')
        expect(result).toBeNull()
      })

      it('should return null for malformed agent ID', () => {
        const spawnableAgents = ['thinker', 'reviewer']
        const result = getMatchingSpawn(
          spawnableAgents,
          'invalid/agent/format/too/many/slashes',
        )
        expect(result).toBeNull()
      })

      it('should return null when spawnableAgents is empty', () => {
        const spawnableAgents: string[] = []
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBeNull()
      })

      it('should handle malformed spawnable agent IDs gracefully', () => {
        const spawnableAgents = ['', 'invalid/agent/too/many/parts', 'thinker']
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBe('thinker')
      })

      it('should prioritize exact matches over partial matches', () => {
        const spawnableAgents = ['thinker', 'codebuff/thinker@1.0.0']
        const result = getMatchingSpawn(spawnableAgents, 'thinker')
        expect(result).toBe('thinker') // First match wins
      })
    })
  })

  describe('handleSpawnAgents permission validation', () => {
    const createSpawnToolCall = (
      agentType: string,
      prompt = 'test prompt',
      params?: Record<string, unknown>,
    ): CodebuffToolCall<'spawn_agents'> => ({
      toolName: 'spawn_agents' as const,
      toolCallId: 'test-tool-call-id',
      input: {
        agents: [{ agent_type: agentType, prompt, params }],
      },
    })

    it('should allow spawning when agent is in spawnableAgents list', async () => {
      const parentAgent = createMockAgent('parent', ['thinker', 'reviewer'])
      const childAgent = createMockAgent('thinker')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('thinker')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { thinker: childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response')
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should time out hung editor proposal subagents instead of waiting forever', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '5'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: { signal: AbortSignal }) =>
          new Promise((_, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason ?? new Error('aborted')),
              { once: true },
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall('editor-implementor-proposal-1')

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        expect(JSON.stringify(output)).toContain('Error spawning agent')
        expect(JSON.stringify(output)).toContain(
          'editor-implementor-proposal-1 timed out',
        )
        expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
      }
    })

    it('should preserve timeout reason when a proposal subagent returns after abort', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '5'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: { signal: AbortSignal; agentState: any }) =>
          new Promise((resolve) => {
            options.signal.addEventListener(
              'abort',
              () =>
                resolve({
                  agentState: options.agentState,
                  output: {
                    type: 'error',
                    message: 'Run cancelled by user',
                  },
                }),
              { once: true },
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall('editor-implementor-proposal-1')

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        expect(JSON.stringify(output)).toContain(
          'editor-implementor-proposal-1 timed out',
        )
        expect(JSON.stringify(output)).not.toContain('Run cancelled by user')
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
      }
    })

    it('should recover captured editor proposal diffs when timeout fires after progress', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '5'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: { signal: AbortSignal; agentState: any }) =>
          new Promise((_, reject) => {
            options.agentState.messageHistory = [
              {
                role: 'assistant',
                content: [
                  {
                    type: 'tool-call',
                    toolName: 'propose_write_file',
                    input: {
                      path: 'src/a.ts',
                      instructions: 'Add A',
                      content: 'export const a = 1\n',
                    },
                  },
                  {
                    type: 'tool-call',
                    toolName: 'propose_write_file',
                    input: {
                      path: 'src/b.ts',
                      instructions: 'Add B',
                      content: 'export const b = 2\n',
                    },
                  },
                ],
              },
              {
                role: 'tool',
                toolName: 'propose_write_file',
                content: [
                  {
                    type: 'json',
                    value: [
                      { file: 'src/a.ts', unifiedDiff: '@@ diff A' },
                      { file: 'src/b.ts', unifiedDiff: '@@ diff B' },
                    ],
                  },
                ],
              },
            ]
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason ?? new Error('aborted')),
              { once: true },
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall(
          'editor-implementor-proposal-1',
          'test prompt',
          {
            proposalBundleMode: true,
            proposalContext: 'Implement multi-file changes in src/a.ts and src/b.ts.',
          },
        )

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        const serialized = JSON.stringify(output)
        expect(serialized).not.toContain('Error spawning agent')
        expect(serialized).toContain('recoveredFromTimeout')
        expect(serialized).toContain('cleanProposal')
        expect(serialized).toContain('@@ diff A')
        expect(serialized).toContain('@@ diff B')
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
      }
    })

    it('should keep slow proposal subagents alive while they stream progress', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '30'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: {
          signal: AbortSignal
          agentState: any
          onResponseChunk: (chunk: string) => void
        }) =>
          new Promise((resolve, reject) => {
            let progressCount = 0
            const interval = setInterval(() => {
              progressCount++
              options.onResponseChunk('still working')
              if (progressCount === 6) {
                clearInterval(interval)
                resolve({
                  agentState: {
                    ...options.agentState,
                    messageHistory: [assistantMessage('Mock agent response')],
                  },
                  output: {
                    type: 'lastMessage',
                    value: [assistantMessage('Mock agent response')],
                  },
                })
              }
            }, 10)

            options.signal.addEventListener(
              'abort',
              () => {
                clearInterval(interval)
                reject(options.signal.reason ?? new Error('aborted'))
              },
              { once: true },
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall('editor-implementor-proposal-1')

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        expect(JSON.stringify(output)).toContain('Mock agent response')
        expect(JSON.stringify(output)).not.toContain('timed out')
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
      }
    })

    it('should still enforce the proposal hard timeout despite continuous progress', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      const previousHardTimeout =
        process.env.OPENBUFF_EDITOR_PROPOSAL_HARD_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '30'
      process.env.OPENBUFF_EDITOR_PROPOSAL_HARD_TIMEOUT_MS = '55'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: {
          signal: AbortSignal
          onResponseChunk: (chunk: string) => void
        }) =>
          new Promise((_, reject) => {
            const interval = setInterval(() => {
              options.onResponseChunk('still working')
            }, 10)

            options.signal.addEventListener(
              'abort',
              () => {
                clearInterval(interval)
                reject(options.signal.reason ?? new Error('aborted'))
              },
              { once: true },
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall('editor-implementor-proposal-1')

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        const serialized = JSON.stringify(output)
        expect(serialized).toContain('Error spawning agent')
        expect(serialized).toContain('hard limit')
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
        if (previousHardTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_HARD_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_HARD_TIMEOUT_MS =
            previousHardTimeout
        }
      }
    })

    it('should let proposal spawn params override the default editor proposal timeout', async () => {
      const previousTimeout = process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
      process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = '5'

      mockLoopAgentSteps.mockImplementationOnce(
        async (options: { signal: AbortSignal; agentState: any }) =>
          new Promise((resolve, reject) => {
            options.signal.addEventListener(
              'abort',
              () => reject(options.signal.reason ?? new Error('aborted')),
              { once: true },
            )
            setTimeout(
              () =>
                resolve({
                  agentState: {
                    ...options.agentState,
                    messageHistory: [assistantMessage('Mock agent response')],
                  },
                  output: {
                    type: 'lastMessage',
                    value: [assistantMessage('Mock agent response')],
                  },
                }),
              15,
            )
          }),
      )

      try {
        const parentAgent = createMockAgent('parent', [
          'editor-implementor-proposal-1',
        ])
        const childAgent = createMockAgent('editor-implementor-proposal-1')
        const sessionState = getInitialSessionState(mockFileContext)
        const toolCall = createSpawnToolCall(
          'editor-implementor-proposal-1',
          'test prompt',
          { proposalTimeoutMs: 50 },
        )

        const { output } = await handleSpawnAgents({
          ...handleSpawnAgentsBaseParams,
          agentState: sessionState.mainAgentState,
          agentTemplate: parentAgent,
          localAgentTemplates: {
            'editor-implementor-proposal-1': childAgent,
          },
          toolCall,
        })

        expect(JSON.stringify(output)).toContain('Mock agent response')
        expect(JSON.stringify(output)).not.toContain('timed out')
      } finally {
        if (previousTimeout === undefined) {
          delete process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS
        } else {
          process.env.OPENBUFF_EDITOR_PROPOSAL_TIMEOUT_MS = previousTimeout
        }
      }
    })

    it('should report fulfilled subagent error outputs as spawn errors', async () => {
      mockLoopAgentSteps.mockImplementationOnce(async (options: any) => ({
        agentState: options.agentState,
        output: {
          type: 'error',
          message: 'Run cancelled by user',
        },
      }))

      const parentAgent = createMockAgent('parent', [
        'editor-implementor-proposal-1',
      ])
      const childAgent = createMockAgent('editor-implementor-proposal-1')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('editor-implementor-proposal-1')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {
          'editor-implementor-proposal-1': childAgent,
        },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('"errorMessage"')
      expect(JSON.stringify(output)).toContain('Run cancelled by user')
    })

    it('should allow underscored agent_type when hyphenated agent is spawnable', async () => {
      const parentAgent = createMockAgent('parent', ['file-picker'])
      const childAgent = createMockAgent('file-picker')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('file_picker')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'file-picker': childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response')
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
      expect(mockLoopAgentSteps.mock.calls[0][0].agentState.agentType).toBe(
        'file-picker',
      )
    })

    it('should allow underscored published agent_type when hyphenated agent is spawnable', async () => {
      const parentAgent = createMockAgent('parent', [
        'codebuff/file-picker@1.0.0',
      ])
      const childAgent = createMockAgent('codebuff/file-picker@1.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('codebuff/file_picker@1.0.0')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'codebuff/file-picker@1.0.0': childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response')
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
      expect(mockLoopAgentSteps.mock.calls[0][0].agentState.agentType).toBe(
        'codebuff/file-picker@1.0.0',
      )
    })

    it('should reject spawning when agent is not in spawnableAgents list', async () => {
      const parentAgent = createMockAgent('parent', ['thinker']) // Only allows thinker
      const childAgent = createMockAgent('reviewer')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('reviewer') // Try to spawn reviewer

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { reviewer: childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Error spawning agent')
      expect(JSON.stringify(output)).toContain(
        'is not allowed to spawn child agent type reviewer',
      )
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })

    it('should reject spawning when agent template is not found', async () => {
      const parentAgent = createMockAgent('parent', ['nonexistent'])
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('nonexistent')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {}, // Empty - agent not found
        toolCall,
      })

      console.log('output', output)
      expect(JSON.stringify(output)).toContain('Error spawning agent')
      expect(JSON.stringify(output)).toContain(
        'Agent type nonexistent not found',
      )
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })

    it('should handle versioned agent permissions correctly', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@1.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('codebuff/thinker@1.0.0')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'codebuff/thinker@1.0.0': childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response')
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should allow spawning simple agent name when parent allows versioned agent', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@1.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('thinker') // Simple name

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {
          thinker: childAgent,
          'codebuff/thinker@1.0.0': childAgent, // Register with both keys
        },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response')
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should reject when version mismatch exists', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@2.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createSpawnToolCall('codebuff/thinker@2.0.0')

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'codebuff/thinker@2.0.0': childAgent },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Error spawning agent')
      expect(JSON.stringify(output)).toContain(
        'is not allowed to spawn child agent type',
      )
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })

    it('should handle multiple agents with mixed success/failure', async () => {
      const parentAgent = createMockAgent('parent', ['thinker']) // Only allows thinker
      const thinkerAgent = createMockAgent('thinker')
      const reviewerAgent = createMockAgent('reviewer')
      const sessionState = getInitialSessionState(mockFileContext)

      const toolCall: CodebuffToolCall<'spawn_agents'> = {
        toolName: 'spawn_agents' as const,
        toolCallId: 'test-tool-call-id',
        input: {
          agents: [
            { agent_type: 'thinker', prompt: 'Think about this' },
            { agent_type: 'reviewer', prompt: 'Review this' }, // Should fail
          ],
        },
      }

      const { output } = await handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {
          thinker: thinkerAgent,
          reviewer: reviewerAgent,
        },
        toolCall,
      })

      expect(JSON.stringify(output)).toContain('Mock agent response') // Successful thinker spawn
      expect(JSON.stringify(output)).toContain('Error spawning agent') // Failed reviewer spawn
      expect(JSON.stringify(output)).toContain(
        'is not allowed to spawn child agent type reviewer',
      )
      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1) // Only thinker was spawned
    })
  })

  describe('handleSpawnAgentInline permission validation', () => {
    const createInlineSpawnToolCall = (
      agentType: string,
      prompt = 'test prompt',
    ): CodebuffToolCall<'spawn_agent_inline'> => ({
      toolName: 'spawn_agent_inline' as const,
      toolCallId: 'test-tool-call-id',
      input: {
        agent_type: agentType,
        prompt,
      },
    })

    it('should allow spawning inline agent when agent is in spawnableAgents list', async () => {
      const parentAgent = createMockAgent('parent', ['thinker', 'reviewer'])
      const childAgent = createMockAgent('thinker')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('thinker')

      // Should not throw
      await handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { thinker: childAgent },
        toolCall,
      })

      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should reject spawning inline agent when agent is not in spawnableAgents list', async () => {
      const parentAgent = createMockAgent('parent', ['thinker']) // Only allows thinker
      const childAgent = createMockAgent('reviewer')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('reviewer') // Try to spawn reviewer

      const result = handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { reviewer: childAgent },
        toolCall,
      })

      expect(result).rejects.toThrow(
        'is not allowed to spawn child agent type reviewer',
      )
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })

    it('should reject spawning inline agent when agent template is not found', async () => {
      const parentAgent = createMockAgent('parent', ['nonexistent'])
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('nonexistent')

      const result = handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {}, // Empty - agent not found
        toolCall,
      })

      expect(result).rejects.toThrow('Agent type nonexistent not found')
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })

    it('should handle versioned inline agent permissions correctly', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@1.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('codebuff/thinker@1.0.0')

      // Should not throw
      await handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'codebuff/thinker@1.0.0': childAgent },
        toolCall,
      })

      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should allow spawning simple agent name inline when parent allows versioned agent', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@1.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('thinker') // Simple name

      // Should not throw
      await handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: {
          thinker: childAgent,
          'codebuff/thinker@1.0.0': childAgent, // Register with both keys
        },
        toolCall,
      })

      expect(mockLoopAgentSteps).toHaveBeenCalledTimes(1)
    })

    it('should reject inline spawn when version mismatch exists', async () => {
      const parentAgent = createMockAgent('parent', ['codebuff/thinker@1.0.0'])
      const childAgent = createMockAgent('codebuff/thinker@2.0.0')
      const sessionState = getInitialSessionState(mockFileContext)
      const toolCall = createInlineSpawnToolCall('codebuff/thinker@2.0.0')

      const result = handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'codebuff/thinker@2.0.0': childAgent },
        toolCall,
      })

      expect(result).rejects.toThrow('is not allowed to spawn child agent type')
      expect(mockLoopAgentSteps).not.toHaveBeenCalled()
    })
  })
})
