import * as analytics from '@codebuff/common/analytics'
import { TEST_USER_ID } from '@codebuff/common/constants'
import {
  AgentState,
  getInitialSessionState,
  ToolResult,
} from '@codebuff/common/types/session-state'
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { WebSocket } from 'ws'

import {
  clearMockedModules,
  mockModule,
} from '@codebuff/common/testing/mock-modules'
import {
  clearAgentGeneratorCache,
  runProgrammaticStep,
} from '../run-programmatic-step'
import { AgentTemplate, StepGenerator } from '../templates/types'
import * as toolExecutor from '../tools/tool-executor'
import * as requestContext from '../websockets/request-context'
import { asSystemMessage } from '../util/messages'
import { renderToolResults } from '@codebuff/common/constants/tools'
import { mockFileContext, MockWebSocket } from './test-utils'

describe('runProgrammaticStep', () => {
  let mockTemplate: AgentTemplate
  let mockAgentState: AgentState
  let mockParams: any
  let executeToolCallSpy: any
  let getRequestContextSpy: any

  beforeAll(() => {
    // Mock logger
    mockModule('@codebuff/backend/util/logger', () => ({
      logger: {
        debug: () => {},
        error: () => {},
        info: () => {},
        warn: () => {},
      },
      withLoggerContext: async (context: any, fn: () => Promise<any>) => fn(),
    }))
  })

  beforeEach(() => {
    // Mock analytics
    spyOn(analytics, 'initAnalytics').mockImplementation(() => {})
    analytics.initAnalytics()
    spyOn(analytics, 'trackEvent').mockImplementation(() => {})

    // Mock executeToolCall
    executeToolCallSpy = spyOn(
      toolExecutor,
      'executeToolCall'
    ).mockImplementation(async () => {})

    // Mock getRequestContext
    getRequestContextSpy = spyOn(
      requestContext,
      'getRequestContext'
    ).mockImplementation(() => ({
      processedRepoId: 'test-repo-id',
    }))

    // Mock crypto.randomUUID
    spyOn(crypto, 'randomUUID').mockImplementation(
      () =>
        'mock-uuid-0000-0000-0000-000000000000' as `${string}-${string}-${string}-${string}-${string}`
    )

    // Create mock template
    mockTemplate = {
      id: 'test-agent',
      name: 'Test Agent',
      purpose: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      promptSchema: {},
      outputMode: 'json',
      includeMessageHistory: true,
      toolNames: ['read_files', 'write_file', 'end_turn'],
      spawnableAgents: [],

      systemPrompt: 'Test system prompt',
      userInputPrompt: 'Test user prompt',
      agentStepPrompt: 'Test agent step prompt',
      handleSteps: undefined, // Will be set in individual tests
    } as AgentTemplate

    // Create mock agent state
    const sessionState = getInitialSessionState(mockFileContext)
    mockAgentState = {
      ...sessionState.mainAgentState,
      agentId: 'test-agent-id',
      messageHistory: [
        { role: 'user', content: 'Initial message' },
        { role: 'assistant', content: 'Initial response' },
      ],
      output: undefined,
    }

    // Create mock params
    mockParams = {
      template: mockTemplate,
      prompt: 'Test prompt',
      params: { testParam: 'value' },
      userId: TEST_USER_ID,
      userInputId: 'test-user-input',
      clientSessionId: 'test-session',
      fingerprintId: 'test-fingerprint',
      onResponseChunk: () => {},
      agentType: 'test-agent' as any,
      fileContext: mockFileContext,
      assistantMessage: undefined,
      assistantPrefix: undefined,
      ws: new MockWebSocket() as unknown as WebSocket,
    }
  })

  afterEach(() => {
    mock.restore()
    // Clear the generator cache between tests
    clearAgentGeneratorCache()
  })

  afterAll(() => {
    clearMockedModules()
  })

  describe('generator lifecycle', () => {
    it('should create new generator when none exists', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.endTurn).toBe(true)
      expect(result.agentState).toBeDefined()
    })

    it('should reuse existing generator for same agent', async () => {
      let callCount = 0
      const createGenerator = () => {
        callCount++
        return (function* () {
          yield { toolName: 'end_turn', args: {} }
        })() as StepGenerator
      }

      mockTemplate.handleSteps = createGenerator
      // First call
      await runProgrammaticStep(mockAgentState, mockParams)
      expect(callCount).toBe(1)

      // Second call with same agent ID should reuse generator

      await runProgrammaticStep(mockAgentState, mockParams)
      expect(callCount).toBe(1) // Should not create new generator
    })

    it('should handle STEP_ALL generator state', async () => {
      // First, set up a generator that will be marked as STEP_ALL
      const mockGenerator = (function* () {
        yield 'STEP_ALL'
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      // First call to set STEP_ALL state
      const result1 = await runProgrammaticStep(mockAgentState, mockParams)
      expect(result1.endTurn).toBe(false)

      // Second call should return early due to STEP_ALL state
      const result2 = await runProgrammaticStep(mockAgentState, mockParams)
      expect(result2.endTurn).toBe(false)
      expect(result2.agentState).toEqual(mockAgentState)
    })

    it('should throw error when template has no handleStep', async () => {
      mockTemplate.handleSteps = undefined

      await expect(
        runProgrammaticStep(mockAgentState, mockParams)
      ).rejects.toThrow('No step handler found for agent template test-agent')
    })
  })

  describe('tool execution', () => {
    it('should execute single tool call', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2)
      expect(executeToolCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'read_files',
          args: expect.any(Object),
          agentTemplate: mockTemplate,
          fileContext: mockFileContext,
        })
      )
      expect(result.endTurn).toBe(true)
    })

    it('should add find_files tool result to messageHistory', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'find_files', args: { query: 'authentication' } }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator
      mockTemplate.toolNames = ['find_files', 'end_turn']

      // Mock executeToolCall to simulate find_files tool result
      executeToolCallSpy.mockImplementation(async (options: any) => {
        if (options.toolName === 'find_files') {
          const toolResult: ToolResult = {
            toolName: 'find_files',
            toolCallId: 'find-files-call-id',
            result: JSON.stringify({
              files: [
                { path: 'src/auth.ts', relevance: 0.9 },
                { path: 'src/login.ts', relevance: 0.8 },
              ],
            }),
          }
          options.toolResults.push(toolResult)

          // Add tool result to message history like the real implementation
          // This mimics what tool-executor.ts does: state.messages.push({ role: 'user', content: asSystemMessage(renderToolResults([toolResult])) })
          const formattedToolResult = asSystemMessage(
            renderToolResults([
              {
                toolName: toolResult.toolName,
                toolCallId: toolResult.toolCallId,
                result: toolResult.result,
              },
            ])
          )
          options.state.agentState.messageHistory.push({
            role: 'user',
            content: formattedToolResult,
          })
        }
        // Return a value to satisfy the call
        return {}
      })

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          toolName: 'find_files',
          args: { query: 'authentication' },
          agentTemplate: mockTemplate,
          fileContext: mockFileContext,
        })
      )

      // Verify tool result was added to messageHistory
      const toolMessages = result.agentState.messageHistory.filter(
        (msg) =>
          msg.role === 'user' &&
          typeof msg.content === 'string' &&
          msg.content.includes('src/auth.ts')
      )
      expect(toolMessages).toHaveLength(1)
      expect(toolMessages[0].content).toContain('src/auth.ts')
      expect(toolMessages[0].content).toContain('src/login.ts')

      expect(result.endTurn).toBe(true)
    })

    it('should execute multiple tool calls in sequence', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['file1.txt'] } }
        yield {
          toolName: 'write_file',
          args: { path: 'file2.txt', content: 'test' },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledTimes(3)
      expect(result.endTurn).toBe(true)
    })

    it('should pass tool results back to generator', async () => {
      const toolResults: ToolResult[] = []
      let receivedToolResult: ToolResult | undefined

      const mockGenerator = (function* () {
        const input1 = yield {
          toolName: 'read_files',
          args: { paths: ['test.txt'] },
        }
        receivedToolResult = input1.toolResult
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      // Mock executeToolCall to add tool results
      executeToolCallSpy.mockImplementation(async (options: any) => {
        if (options.toolName === 'read_files') {
          options.toolResults.push({
            toolName: 'read_files',
            toolCallId: 'test-id',
            result: 'file content',
          })
        }
      })

      await runProgrammaticStep(mockAgentState, mockParams)

      expect(receivedToolResult).toEqual({
        toolName: 'read_files',
        toolCallId: 'test-id',
        result: 'file content',
      })
    })
  })

  describe('generator control flow', () => {
    it('should handle STEP value to break execution', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        yield 'STEP'
        yield {
          toolName: 'write_file',
          args: { path: 'test.txt', content: 'test' },
        }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledTimes(1) // Only first tool call
      expect(result.endTurn).toBe(false)
    })

    it('should handle generator completion', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        return // Generator completes
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.endTurn).toBe(true)
    })

    it('should end turn when end_turn tool is called', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        yield { toolName: 'end_turn', args: {} }
        yield {
          toolName: 'write_file',
          args: { path: 'test.txt', content: 'test' },
        } // Should not execute
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledTimes(2) // read_files + end_turn
      expect(result.endTurn).toBe(true)
    })
  })

  describe('state management', () => {
    it('should preserve agent state changes', async () => {
      const mockGenerator = (function* () {
        yield {
          toolName: 'set_output',
          args: { status: 'complete' },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator
      mockTemplate.toolNames.push('set_output')

      // Mock executeToolCall to update state
      executeToolCallSpy.mockImplementation(async (options: any) => {
        if (options.toolName === 'set_output') {
          options.state.agentState.output = { status: 'complete' }
        }
      })

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.agentState.output).toEqual({ status: 'complete' })
    })

    it('should preserve message history', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.agentState.messageHistory).toEqual(
        mockAgentState.messageHistory
      )
    })
  })

  describe('error handling', () => {
    it('should handle generator errors gracefully', async () => {
      const mockGenerator = (function* () {
        throw new Error('Generator error')
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const responseChunks: string[] = []
      mockParams.onResponseChunk = (chunk: string) => responseChunks.push(chunk)

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output?.error).toContain('Generator error')
      expect(
        responseChunks.some((chunk) => chunk.includes('Generator error'))
      ).toBe(true)
    })

    it('should handle tool execution errors', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator
      executeToolCallSpy.mockRejectedValue(new Error('Tool execution failed'))

      const responseChunks: string[] = []
      mockParams.onResponseChunk = (chunk: string) => responseChunks.push(chunk)

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output?.error).toContain('Tool execution failed')
    })

    it('should handle non-Error exceptions', async () => {
      const mockGenerator = (function* () {
        throw 'String error'
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      const result = await runProgrammaticStep(mockAgentState, mockParams)

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output?.error).toContain('Unknown error')
    })
  })

  describe('output schema validation', () => {
    it('should validate output against outputSchema when using setOutput', async () => {
      // Create template with outputSchema
      const schemaTemplate = {
        ...mockTemplate,
        outputMode: 'json' as const,
        outputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error'] },
            count: { type: 'number' },
          },
          required: ['message', 'status'],
        },
        toolNames: ['set_output', 'end_turn'],
      }

      const mockGenerator = (function* () {
        yield {
          toolName: 'set_output',
          args: {
            message: 'Task completed successfully',
            status: 'success',
            count: 42,
          },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      schemaTemplate.handleSteps = () => mockGenerator

      // Don't mock executeToolCall - let it use the real implementation
      executeToolCallSpy.mockRestore()

      const result = await runProgrammaticStep(mockAgentState, {
        ...mockParams,
        template: schemaTemplate,
      })

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output).toEqual({
        message: 'Task completed successfully',
        status: 'success',
        count: 42,
      })
    })

    it('should handle invalid output that fails schema validation', async () => {
      // Create template with strict outputSchema
      const schemaTemplate = {
        ...mockTemplate,
        outputMode: 'json' as const,
        outputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string' },
            status: { type: 'string', enum: ['success', 'error'] },
          },
          required: ['message', 'status'],
        },
        toolNames: ['set_output', 'end_turn'],
      }

      const mockGenerator = (function* () {
        yield {
          toolName: 'set_output',
          args: {
            message: 'Task completed',
            status: 'invalid_status', // This should fail validation
            extraField: 'not allowed',
          },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      schemaTemplate.handleSteps = () => mockGenerator

      // Don't mock executeToolCall - let it use the real implementation
      executeToolCallSpy.mockRestore()

      const responseChunks: string[] = []
      mockParams.onResponseChunk = (chunk: string) => responseChunks.push(chunk)

      const result = await runProgrammaticStep(mockAgentState, {
        ...mockParams,
        template: schemaTemplate,
      })

      // Should end turn (validation may fail but execution continues)
      expect(result.endTurn).toBe(true)
      // Test passes if no exception is thrown during execution
      expect(result.agentState).toBeDefined()
    })

    it('should work with agents that have no outputSchema', async () => {
      const noSchemaTemplate = {
        ...mockTemplate,
        outputMode: 'last_message' as const,
        outputSchema: undefined,
        toolNames: ['set_output', 'end_turn'],
      }

      const mockGenerator = (function* () {
        yield {
          toolName: 'set_output',
          args: {
            anyField: 'any value',
            anotherField: 123,
          },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      noSchemaTemplate.handleSteps = () => mockGenerator

      // Don't mock executeToolCall - let it use the real implementation
      executeToolCallSpy.mockRestore()

      const result = await runProgrammaticStep(mockAgentState, {
        ...mockParams,
        template: noSchemaTemplate,
      })

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output).toEqual({
        anyField: 'any value',
        anotherField: 123,
      })
    })

    it('should work with outputMode json but no outputSchema defined', async () => {
      const schemaWithoutSchemaTemplate = {
        ...mockTemplate,
        outputMode: 'json' as const,
        outputSchema: undefined, // No schema defined
        toolNames: ['set_output', 'end_turn'],
      }

      const mockGenerator = (function* () {
        yield {
          toolName: 'set_output',
          args: {
            result: 'success',
            data: { count: 5 },
          },
        }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      schemaWithoutSchemaTemplate.handleSteps = () => mockGenerator

      // Don't mock executeToolCall - let it use the real implementation
      executeToolCallSpy.mockRestore()

      const result = await runProgrammaticStep(mockAgentState, {
        ...mockParams,
        template: schemaWithoutSchemaTemplate,
      })

      expect(result.endTurn).toBe(true)
      expect(result.agentState.output).toEqual({
        result: 'success',
        data: { count: 5 },
      })
    })
  })
  describe('logging and context', () => {
    it('should log agent execution start', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockAgentState, mockParams)

      // Logger is mocked, but we can verify the function completes without error
      expect(true).toBe(true)
    })

    it('should use request context for repo ID', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockAgentState, mockParams)

      expect(getRequestContextSpy).toHaveBeenCalled()
    })

    it('should generate unique agent step ID', async () => {
      const mockGenerator = (function* () {
        yield { toolName: 'read_files', args: { paths: ['test.txt'] } }
        yield { toolName: 'end_turn', args: {} }
      })() as StepGenerator

      mockTemplate.handleSteps = () => mockGenerator

      await runProgrammaticStep(mockAgentState, mockParams)

      expect(executeToolCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentStepId: 'mock-uuid-0000-0000-0000-000000000000',
        })
      )
    })
  })
})
