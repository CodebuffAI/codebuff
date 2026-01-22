import { describe, expect, it, mock } from 'bun:test'
import { z } from 'zod/v4'

import {
  buildInitialMessages,
  buildToolDefinitions,
  extractErrorMessage,
  getErrorStatusCode,
  handleOutputSchemaRetry,
  isPaymentRequiredError,
} from '../agent-step-helpers'

import type { AgentTemplate } from '../templates/types'
import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { AgentState } from '@codebuff/common/types/session-state'
import type { ToolSet } from 'ai'

// Mock logger for tests
const mockLogger = {
  debug: mock(() => {}),
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
}

// Helper to create minimal agent state
function createMockAgentState(overrides: Partial<AgentState> = {}): AgentState {
  return {
    agentId: 'test-agent-id',
    agentType: 'test-agent',
    parentId: undefined,
    ancestorRunIds: [],
    runId: undefined,
    messageHistory: [],
    childRunIds: [],
    stepsRemaining: 10,
    creditsUsed: 0,
    directCreditsUsed: 0,
    contextTokenCount: 0,
    systemPrompt: '',
    toolDefinitions: {},
    agentContext: {},
    output: undefined,
    ...overrides,
  } as AgentState
}

// Helper to create minimal agent template
function createMockAgentTemplate(overrides: Partial<AgentTemplate> = {}): AgentTemplate {
  return {
    id: 'test-agent',
    displayName: 'Test Agent',
    spawnerPrompt: 'Testing',
    model: 'claude-3-5-sonnet-20241022',
    inputSchema: {},
    outputMode: 'structured_output',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: ['read_files', 'write_file', 'end_turn'],
    spawnableAgents: [],
    systemPrompt: 'Test system prompt',
    instructionsPrompt: 'Test instructions prompt',
    stepPrompt: 'Test step prompt',
    handleSteps: undefined,
    outputSchema: undefined,
    ...overrides,
  } as AgentTemplate
}

describe('buildInitialMessages', () => {
  const mockAgentTemplate = createMockAgentTemplate()
  const localAgentTemplates = { 'test-agent': mockAgentTemplate }

  it('builds messages with prompt only', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: 'Hello, world!',
      spawnParams: undefined,
    })

    // Should have one user message with the prompt
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('USER_PROMPT')
    expect(result[0].keepDuringTruncation).toBe(true)
  })

  it('builds messages with spawnParams only', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: undefined,
      spawnParams: { key: 'value', number: 42 },
    })

    // Should have one user message with params
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('USER_PROMPT')
  })

  it('builds messages with content (text parts) only', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: [{ type: 'text', text: 'Content text' }],
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: undefined,
      spawnParams: undefined,
    })

    // Should have one user message with content
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('USER_PROMPT')
  })

  it('builds messages with all three combined', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: [{ type: 'text', text: 'Content text' }],
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: 'Hello prompt',
      spawnParams: { key: 'value' },
    })

    // Should have user message combining all inputs
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('USER_PROMPT')
  })

  it('builds messages with instructionsPrompt', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: 'These are the instructions',
      localAgentTemplates,
      prompt: 'User prompt',
      spawnParams: undefined,
    })

    // Should have user prompt message and instructions message
    expect(result.length).toBe(2)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('USER_PROMPT')
    expect(result[1].role).toBe('user')
    expect(result[1].tags).toContain('INSTRUCTIONS_PROMPT')
  })

  it('builds messages with existing messageHistory', () => {
    const existingMessage: Message = {
      role: 'user',
      content: [{ type: 'text', text: 'Previous message' }],
      sentAt: Date.now(),
    }
    const agentState = createMockAgentState({
      messageHistory: [existingMessage],
    })

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: 'New prompt',
      spawnParams: undefined,
    })

    // Should preserve existing history and add new message
    expect(result.length).toBe(2)
    expect(result[0]).toBe(existingMessage)
    expect(result[1].role).toBe('user')
    expect(result[1].tags).toContain('USER_PROMPT')
  })

  it('returns empty array when no inputs provided', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: undefined,
      localAgentTemplates,
      prompt: undefined,
      spawnParams: undefined,
    })

    // Should return empty array
    expect(result).toEqual([])
  })

  it('returns only instructions when no user message but instructionsPrompt provided', () => {
    const agentState = createMockAgentState()

    const result = buildInitialMessages({
      agentState,
      agentTemplate: mockAgentTemplate,
      content: undefined,
      instructionsPrompt: 'Just instructions',
      localAgentTemplates,
      prompt: undefined,
      spawnParams: undefined,
    })

    // Should have only the instructions message
    expect(result.length).toBe(1)
    expect(result[0].role).toBe('user')
    expect(result[0].tags).toContain('INSTRUCTIONS_PROMPT')
  })
})

describe('handleOutputSchemaRetry', () => {
  it('triggers retry when output is required but missing', () => {
    const outputSchema = z.object({ result: z.string() })
    const agentState = createMockAgentState({ output: undefined })
    const agentTemplate = createMockAgentTemplate({ outputSchema })

    const result = handleOutputSchemaRetry({
      agentState,
      agentTemplate,
      hasRetriedOutputSchema: false,
      shouldEndTurn: true,
      runId: 'test-run-id',
      agentType: 'test-agent',
      logger: mockLogger as any,
    })

    // Should return shouldEndTurn: false to continue loop
    expect(result.shouldEndTurn).toBe(false)
    // Should mark that we've retried
    expect(result.hasRetriedOutputSchema).toBe(true)
    // Should add a system message to message history
    expect(result.agentState.messageHistory.length).toBe(1)
    expect(result.agentState.messageHistory[0].role).toBe('user')
    // Message should mention set_output
    const content = result.agentState.messageHistory[0].content[0]
    expect(content.type).toBe('text')
    if (content.type === 'text') {
      expect(content.text).toContain('set_output')
    }
    // Should have logged a warning
    expect(mockLogger.warn).toHaveBeenCalled()
  })

  it('returns unchanged when output is already set', () => {
    const outputSchema = z.object({ result: z.string() })
    const agentState = createMockAgentState({ output: { result: 'done' } })
    const agentTemplate = createMockAgentTemplate({ outputSchema })

    const result = handleOutputSchemaRetry({
      agentState,
      agentTemplate,
      hasRetriedOutputSchema: false,
      shouldEndTurn: true,
      runId: 'test-run-id',
      agentType: 'test-agent',
      logger: mockLogger as any,
    })

    // Should return unchanged
    expect(result.shouldEndTurn).toBe(true)
    expect(result.hasRetriedOutputSchema).toBe(false)
    expect(result.agentState).toBe(agentState)
  })

  it('returns unchanged when no outputSchema defined', () => {
    const agentState = createMockAgentState({ output: undefined })
    const agentTemplate = createMockAgentTemplate({ outputSchema: undefined })

    const result = handleOutputSchemaRetry({
      agentState,
      agentTemplate,
      hasRetriedOutputSchema: false,
      shouldEndTurn: true,
      runId: 'test-run-id',
      agentType: 'test-agent',
      logger: mockLogger as any,
    })

    // Should return unchanged - no outputSchema means no validation needed
    expect(result.shouldEndTurn).toBe(true)
    expect(result.hasRetriedOutputSchema).toBe(false)
    expect(result.agentState).toBe(agentState)
  })

  it('does not retry when already retried once', () => {
    const outputSchema = z.object({ result: z.string() })
    const agentState = createMockAgentState({ output: undefined })
    const agentTemplate = createMockAgentTemplate({ outputSchema })

    const result = handleOutputSchemaRetry({
      agentState,
      agentTemplate,
      hasRetriedOutputSchema: true, // Already retried
      shouldEndTurn: true,
      runId: 'test-run-id',
      agentType: 'test-agent',
      logger: mockLogger as any,
    })

    // Should return unchanged - already retried once
    expect(result.shouldEndTurn).toBe(true)
    expect(result.hasRetriedOutputSchema).toBe(true)
    expect(result.agentState).toBe(agentState)
  })

  it('does not trigger when shouldEndTurn is false', () => {
    const outputSchema = z.object({ result: z.string() })
    const agentState = createMockAgentState({ output: undefined })
    const agentTemplate = createMockAgentTemplate({ outputSchema })

    const result = handleOutputSchemaRetry({
      agentState,
      agentTemplate,
      hasRetriedOutputSchema: false,
      shouldEndTurn: false, // Not ending turn yet
      runId: 'test-run-id',
      agentType: 'test-agent',
      logger: mockLogger as any,
    })

    // Should return unchanged - not ending turn, so no validation needed yet
    expect(result.shouldEndTurn).toBe(false)
    expect(result.hasRetriedOutputSchema).toBe(false)
    expect(result.agentState).toBe(agentState)
  })
})

describe('extractErrorMessage', () => {
  it('extracts message and stack from Error object', () => {
    const error = new Error('Test error message')
    const result = extractErrorMessage(error)

    expect(result).toContain('Test error message')
    expect(result).toContain('\n\n') // Stack separator
  })

  it('extracts message from Error without stack', () => {
    const error = new Error('Test error message')
    error.stack = undefined

    const result = extractErrorMessage(error)

    expect(result).toBe('Test error message')
    expect(result).not.toContain('\n\n')
  })

  it('converts string to string', () => {
    const result = extractErrorMessage('Simple string error')

    expect(result).toBe('Simple string error')
  })

  it('converts object to string', () => {
    const result = extractErrorMessage({ code: 'ERR_001', message: 'Object error' })

    expect(result).toBe('[object Object]')
  })

  it('converts number to string', () => {
    const result = extractErrorMessage(42)

    expect(result).toBe('42')
  })

  it('converts null to string', () => {
    const result = extractErrorMessage(null)

    expect(result).toBe('null')
  })

  it('converts undefined to string', () => {
    const result = extractErrorMessage(undefined)

    expect(result).toBe('undefined')
  })
})

describe('isPaymentRequiredError', () => {
  it('returns true for 402 status code', () => {
    const error = { statusCode: 402, message: 'Payment Required' }

    expect(isPaymentRequiredError(error)).toBe(true)
  })

  it('returns false for 401 status code', () => {
    const error = { statusCode: 401, message: 'Unauthorized' }

    expect(isPaymentRequiredError(error)).toBe(false)
  })

  it('returns false for 500 status code', () => {
    const error = { statusCode: 500, message: 'Internal Server Error' }

    expect(isPaymentRequiredError(error)).toBe(false)
  })

  it('returns false for error without statusCode', () => {
    const error = new Error('Regular error')

    expect(isPaymentRequiredError(error)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(isPaymentRequiredError('string error')).toBe(false)
    expect(isPaymentRequiredError(42)).toBe(false)
    expect(isPaymentRequiredError(null)).toBe(false)
    expect(isPaymentRequiredError(undefined)).toBe(false)
  })

  it('returns false for object with non-numeric statusCode', () => {
    const error = { statusCode: '402', message: 'String status' }

    expect(isPaymentRequiredError(error)).toBe(false)
  })
})

describe('getErrorStatusCode', () => {
  it('returns status code when present', () => {
    const error = { statusCode: 404, message: 'Not Found' }

    expect(getErrorStatusCode(error)).toBe(404)
  })

  it('returns 402 for payment required error', () => {
    const error = { statusCode: 402, message: 'Payment Required' }

    expect(getErrorStatusCode(error)).toBe(402)
  })

  it('returns undefined for error without statusCode', () => {
    const error = new Error('Regular error')

    expect(getErrorStatusCode(error)).toBeUndefined()
  })

  it('returns undefined for non-object', () => {
    expect(getErrorStatusCode('string error')).toBeUndefined()
    expect(getErrorStatusCode(42)).toBeUndefined()
    expect(getErrorStatusCode(null)).toBeUndefined()
    expect(getErrorStatusCode(undefined)).toBeUndefined()
  })

  it('returns undefined for object with non-numeric statusCode', () => {
    const error = { statusCode: '500', message: 'String status' }

    expect(getErrorStatusCode(error)).toBeUndefined()
  })
})

describe('buildToolDefinitions', () => {
  it('returns empty object for empty ToolSet', () => {
    const tools: ToolSet = {}

    const result = buildToolDefinitions(tools)

    expect(result).toEqual({})
  })

  it('builds definitions for multiple tools', () => {
    // Mock tools with the actual AI SDK ToolSet structure (has inputSchema, not parameters)
    const tools = {
      read_files: {
        description: 'Read files from disk',
        inputSchema: { type: 'object', properties: { paths: { type: 'array' } } },
      },
      write_file: {
        description: 'Write a file to disk',
        inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      },
    } as unknown as ToolSet

    const result = buildToolDefinitions(tools)

    expect(Object.keys(result)).toHaveLength(2)
    expect(result.read_files).toBeDefined()
    expect(result.write_file).toBeDefined()
    expect(result.read_files.description).toBe('Read files from disk')
    expect(result.write_file.description).toBe('Write a file to disk')
  })

  it('handles tools without description', () => {
    const tools = {
      silent_tool: {
        description: undefined,
        inputSchema: { type: 'object' },
      },
    } as unknown as ToolSet

    const result = buildToolDefinitions(tools)

    expect(result.silent_tool.description).toBeUndefined()
    expect(result.silent_tool.inputSchema).toBeDefined()
  })

  it('includes inputSchema in output', () => {
    const tools = {
      test_tool: {
        description: 'Test tool',
        inputSchema: { 
          type: 'object',
          properties: {
            name: { type: 'string' },
            count: { type: 'number' },
          },
        },
      },
    } as unknown as ToolSet

    const result = buildToolDefinitions(tools)

    expect(result.test_tool.inputSchema).toBeDefined()
    expect(typeof result.test_tool.inputSchema).toBe('object')
  })
})
