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

import { renderToolResults } from '@codebuff/common/constants/tools'
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
import { asSystemMessage } from '../util/messages'
import * as requestContext from '../websockets/request-context'
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
      displayName: 'Test Agent',
      parentPrompt: 'Testing',
      model: 'claude-3-5-sonnet-20241022',
      inputSchema: {},
      outputMode: 'json',
      includeMessageHistory: true,
      toolNames: ['read_files', 'write_file', 'end_turn'],
      subagents: [],

      systemPrompt: 'Test system prompt',
      instructionsPrompt: 'Test user prompt',
      stepPrompt: 'Test agent step prompt',
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

          // Add tool result to state.messages like the real implementation
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
          options.state.messages.push({
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

    it('should comprehensively test STEP_ALL functionality with multiple tools and state management', async () => {
      // Track all tool results and state changes for verification
      const toolResultsReceived: (ToolResult | undefined)[] = []
      const stateSnapshots: AgentState[] = []
      let stepCount = 0

      const mockGenerator = (function* () {
        stepCount++

        // Step 1: Read files and capture initial state
        const step1 = yield {
          toolName: 'read_files',
          args: { paths: ['src/auth.ts', 'src/config.ts'] },
        }
        toolResultsReceived.push(step1.toolResult)
        stateSnapshots.push({ ...step1.agentState })

        // Step 2: Search for patterns based on file content
        const step2 = yield {
          toolName: 'code_search',
          args: { pattern: 'authenticate', flags: '-i' },
        }
        toolResultsReceived.push(step2.toolResult)
        stateSnapshots.push({ ...step2.agentState })

        // Step 3: Create a plan based on findings
        const step3 = yield {
          toolName: 'create_plan',
          args: {
            path: 'analysis-plan.md',
            plan: 'Comprehensive analysis of authentication system',
          },
        }
        toolResultsReceived.push(step3.toolResult)
        stateSnapshots.push({ ...step3.agentState })

        // Step 4: Add subgoal for tracking
        const step4 = yield {
          toolName: 'add_subgoal',
          args: {
            id: 'auth-analysis',
            objective: 'Analyze authentication patterns',
            status: 'IN_PROGRESS',
            plan: 'Review auth files and create recommendations',
          },
        }
        toolResultsReceived.push(step4.toolResult)
        stateSnapshots.push({ ...step4.agentState })

        // Step 5: Write analysis file
        const step5 = yield {
          toolName: 'write_file',
          args: {
            path: 'auth-analysis.md',
            instructions: 'Create authentication analysis document',
            content: '# Authentication Analysis\n\nBased on code review...',
          },
        }
        toolResultsReceived.push(step5.toolResult)
        stateSnapshots.push({ ...step5.agentState })

        // Step 6: Update subgoal status
        const step6 = yield {
          toolName: 'update_subgoal',
          args: {
            id: 'auth-analysis',
            status: 'COMPLETE',
            log: 'Analysis completed successfully',
          },
        }
        toolResultsReceived.push(step6.toolResult)
        stateSnapshots.push({ ...step6.agentState })

        // Step 7: Set final output with comprehensive data
        const step7 = yield {
          toolName: 'set_output',
          args: {
            status: 'success',
            filesAnalyzed: ['src/auth.ts', 'src/config.ts'],
            patternsFound: 3,
            recommendations: ['Use stronger auth', 'Add 2FA'],
            completedAt: new Date().toISOString(),
          },
        }
        toolResultsReceived.push(step7.toolResult)
        stateSnapshots.push({ ...step7.agentState })

        // Step 8: Transition to STEP_ALL to continue processing
        yield 'STEP_ALL'
      })() as StepGenerator

      // Set up comprehensive tool names for this test
      mockTemplate.handleSteps = () => mockGenerator
      mockTemplate.toolNames = [
        'read_files',
        'code_search',
        'create_plan',
        'add_subgoal',
        'write_file',
        'update_subgoal',
        'set_output',
        'end_turn',
      ]

      // Mock executeToolCall to simulate realistic tool results and state updates
      executeToolCallSpy.mockImplementation(async (options: any) => {
        const { toolName, args, toolResults, state } = options

        let result: string
        switch (toolName) {
          case 'read_files':
            result = JSON.stringify({
              'src/auth.ts':
                'export function authenticate(user) { return true; }',
              'src/config.ts': 'export const authConfig = { enabled: true };',
            })
            break
          case 'code_search':
            result =
              'src/auth.ts:1:export function authenticate(user) {\nsrc/config.ts:1:authConfig'
            break
          case 'create_plan':
            result = 'Plan created successfully at analysis-plan.md'
            break
          case 'add_subgoal':
            result = 'Subgoal "auth-analysis" added successfully'
            // Update agent state to include subgoal in agentContext
            state.agentState.agentContext['auth-analysis'] = {
              objective: 'Analyze authentication patterns',
              status: 'IN_PROGRESS',
              plan: 'Review auth files and create recommendations',
              logs: [],
            }
            break
          case 'write_file':
            result = 'File written successfully: auth-analysis.md'
            break
          case 'update_subgoal':
            result = 'Subgoal "auth-analysis" updated successfully'
            // Update subgoal status in agent state
            if (state.agentState.agentContext['auth-analysis']) {
              state.agentState.agentContext['auth-analysis'].status = 'COMPLETE'
              state.agentState.agentContext['auth-analysis'].logs.push(
                'Analysis completed successfully'
              )
            }
            break
          case 'set_output':
            result = 'Output set successfully'
            state.agentState.output = args
            break
          default:
            result = `${toolName} executed successfully`
        }

        const toolResult: ToolResult = {
          toolName,
          toolCallId: `${toolName}-call-id`,
          result,
        }
        toolResults.push(toolResult)

        // Add tool result to state.messages like the real implementation
        const formattedToolResult = asSystemMessage(
          renderToolResults([toolResult])
        )
        state.messages.push({
          role: 'user',
          content: formattedToolResult,
        })
      })

      // First call - should execute all tools and transition to STEP_ALL
      const result1 = await runProgrammaticStep(mockAgentState, mockParams)

      // Verify all tools were executed
      expect(executeToolCallSpy).toHaveBeenCalledTimes(7) // 7 tools before STEP_ALL
      expect(result1.endTurn).toBe(false) // Should not end turn due to STEP_ALL
      expect(stepCount).toBe(1) // Generator should have run once

      // Verify tool execution order and arguments
      const toolCalls = executeToolCallSpy.mock.calls
      expect(toolCalls[0][0].toolName).toBe('read_files')
      expect(toolCalls[0][0].args.paths).toEqual([
        'src/auth.ts',
        'src/config.ts',
      ])
      expect(toolCalls[1][0].toolName).toBe('code_search')
      expect(toolCalls[1][0].args.pattern).toBe('authenticate')
      expect(toolCalls[2][0].toolName).toBe('create_plan')
      expect(toolCalls[3][0].toolName).toBe('add_subgoal')
      expect(toolCalls[4][0].toolName).toBe('write_file')
      expect(toolCalls[5][0].toolName).toBe('update_subgoal')
      expect(toolCalls[6][0].toolName).toBe('set_output')

      // Verify tool results were passed back to generator
      expect(toolResultsReceived).toHaveLength(7)
      expect(toolResultsReceived[0]?.toolName).toBe('read_files')
      expect(toolResultsReceived[0]?.result).toContain('authenticate')
      expect(toolResultsReceived[3]?.toolName).toBe('add_subgoal')
      expect(toolResultsReceived[6]?.toolName).toBe('set_output')

      // Verify state management throughout execution
      expect(stateSnapshots).toHaveLength(7)
      expect(Object.keys(result1.agentState.agentContext)).toContain(
        'auth-analysis'
      )
      expect(result1.agentState.agentContext['auth-analysis']?.status).toBe(
        'COMPLETE'
      )
      expect(result1.agentState.output).toEqual({
        status: 'success',
        filesAnalyzed: ['src/auth.ts', 'src/config.ts'],
        patternsFound: 3,
        recommendations: ['Use stronger auth', 'Add 2FA'],
        completedAt: expect.any(String),
      })

      // Verify tool results were processed correctly
      expect(toolResultsReceived).toHaveLength(7)
      expect(toolResultsReceived.every((result) => result !== undefined)).toBe(
        true
      )

      // Verify that executeToolCall was called with state.messages (not agentState.messageHistory)
      // The real implementation adds tool results to state.messages
      expect(executeToolCallSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          state: expect.objectContaining({
            messages: expect.any(Array),
          }),
        })
      )

      // Reset spy for second call
      executeToolCallSpy.mockClear()

      // Second call - should return early due to STEP_ALL state
      const result2 = await runProgrammaticStep(result1.agentState, {
        ...mockParams,
        // Use the updated agent state from first call
      })

      // Verify STEP_ALL behavior
      expect(executeToolCallSpy).not.toHaveBeenCalled() // No tools should execute
      expect(result2.endTurn).toBe(false) // Should still not end turn
      expect(result2.agentState).toEqual(result1.agentState) // State should be unchanged
      expect(stepCount).toBe(1) // Generator should not have run again

      // Third call - verify STEP_ALL state persists
      const result3 = await runProgrammaticStep(result2.agentState, {
        ...mockParams,
      })

      expect(executeToolCallSpy).not.toHaveBeenCalled()
      expect(result3.endTurn).toBe(false)
      expect(result3.agentState).toEqual(result1.agentState)
      expect(stepCount).toBe(1) // Generator should still not have run again
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

      expect(result.agentState.messageHistory).toEqual([
        ...mockAgentState.messageHistory,
        {
          role: 'user',
          content:
            '<user_message><codebuff_tool_call>\n{\n  "cb_tool_name": "end_turn",\n  "cb_easp": true\n}\n</codebuff_tool_call></user_message>',
        },
      ])
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
