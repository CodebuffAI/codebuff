import { describe, test, expect } from 'bun:test'

import thinker from '../thinker/thinker'

import type { AgentState } from '../types/agent-definition'
import type { Message, ToolResultOutput } from '../types/util-types'

describe('thinker agent', () => {
  const createMockAgentState = (
    messageHistory: Message[] = [],
  ): AgentState => ({
    agentId: 'thinker-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory,
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  })

  describe('definition', () => {
    test('has correct id', () => {
      expect(thinker.id).toBe('thinker')
    })

    test('has display name', () => {
      expect(thinker.displayName).toBe('Theo the Theorizer')
    })

    test('uses opus model', () => {
      expect(thinker.model).toBe('anthropic/claude-opus-4.6')
    })

    test('has output mode set to structured_output', () => {
      expect(thinker.outputMode).toBe('structured_output')
    })

    test('includes message history', () => {
      expect(thinker.includeMessageHistory).toBe(true)
    })

    test('inherits parent system prompt', () => {
      expect(thinker.inheritParentSystemPrompt).toBe(true)
    })

    test('has empty tool names', () => {
      expect(thinker.toolNames).toHaveLength(0)
    })

    test('has empty spawnable agents', () => {
      expect(thinker.spawnableAgents).toHaveLength(0)
    })
  })

  describe('input schema', () => {
    test('has prompt parameter', () => {
      expect(thinker.inputSchema?.prompt?.type).toBe('string')
    })

    test('prompt has description', () => {
      expect(thinker.inputSchema?.prompt?.description).toContain('problem')
    })
  })

  describe('output schema', () => {
    test('has object type', () => {
      expect(thinker.outputSchema?.type).toBe('object')
    })

    test('has message property', () => {
      const messageSchema = thinker.outputSchema?.properties?.message
      expect(messageSchema && typeof messageSchema === 'object' && 'type' in messageSchema && messageSchema.type).toBe('string')
    })

    test('message has description', () => {
      const messageSchema = thinker.outputSchema?.properties?.message
      expect(messageSchema && typeof messageSchema === 'object' && 'description' in messageSchema && messageSchema.description).toContain('response')
    })
  })

  describe('instructions prompt', () => {
    test('contains think tag instruction', () => {
      expect(thinker.instructionsPrompt).toContain('<think>')
    })

    test('instructs not to call set_output', () => {
      expect(thinker.instructionsPrompt).toContain('DO NOT call')
      expect(thinker.instructionsPrompt).toContain('set_output')
    })
  })

  describe('handleSteps', () => {
    test('yields STEP to get agent state', () => {
      const mockAgentState = createMockAgentState()
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      const result = generator.next()

      expect(result.value).toBe('STEP')
    })

    test('extracts text from last assistant message', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Let me think about this' }],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      // First yield is STEP
      generator.next()

      // Provide updated agent state
      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      expect(result.value).toEqual({
        toolName: 'set_output',
        input: { message: 'Let me think about this' },
        includeToolCall: false,
      })
    })

    test('removes think tags from output', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '<think>This is my thinking process</think>Final answer here',
            },
          ],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      // First yield is STEP
      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        toolName: string
        input: { message: string }
      }
      expect(toolCall.input.message).toBe('Final answer here')
      expect(toolCall.input.message).not.toContain('<think>')
      expect(toolCall.input.message).not.toContain('</think>')
    })

    test('handles multiline think tags', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: `<think>
Line 1 of thinking
Line 2 of thinking
</think>
Actual response here`,
            },
          ],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Actual response here')
    })

    test('returns error message when no assistant message found', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as {
        toolName: string
        input: { message: string }
      }
      expect(toolCall.toolName).toBe('set_output')
      expect(toolCall.input.message).toContain('Error')
      expect(toolCall.input.message).toContain('No assistant message found')
    })

    test('handles array content in message', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Part 1. ' },
            { type: 'text', text: 'Part 2.' },
          ],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Part 1. Part 2.')
    })

    test('filters out non-text content parts', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Text part' },
            { type: 'tool-call', toolCallId: '1', toolName: 'test', input: {} },
            { type: 'text', text: 'More text' },
          ],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Text partMore text')
      expect(toolCall.input.message).not.toContain('tool-call')
    })

    test('finds last assistant message in mixed history', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First question' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'First answer' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second question' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Final answer' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Tool result' }],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Final answer')
    })

    test('handleSteps can be serialized for sandbox execution', () => {
      const handleStepsString = thinker.handleSteps!.toString()

      // Verify it's a valid generator function string
      expect(handleStepsString).toMatch(/^function\*\s*\(/)

      // Should be able to create a new function from it
      const isolatedFunction = new Function(
        `return (${handleStepsString})`,
      )()
      expect(typeof isolatedFunction).toBe('function')
    })

    test('trims whitespace from extracted text', () => {
      const messages: Message[] = [
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: '  \n  Response with whitespace  \n  ',
            },
          ],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Response with whitespace')
    })

    test('handles string content directly', () => {
      const messages = [
        {
          role: 'assistant' as const,
          content: 'Simple string response' as unknown as [{ type: 'text'; text: string }],
        },
      ]

      const mockAgentState = createMockAgentState(messages)
      const mockLogger = {
        debug: () => { },
        info: () => { },
        warn: () => { },
        error: () => { },
      }

      const generator = thinker.handleSteps!({
        agentState: mockAgentState,
        logger: mockLogger as any,
        params: {},
      })

      generator.next()

      const updatedState = createMockAgentState(messages)
      const result = generator.next({
        agentState: updatedState,
        toolResult: undefined,
        stepsComplete: true,
      })

      const toolCall = result.value as unknown as { input: { message: string } }
      expect(toolCall.input.message).toBe('Simple string response')
    })
  })
})
