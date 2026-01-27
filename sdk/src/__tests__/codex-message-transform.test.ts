import { describe, expect, test } from 'bun:test'

import {
  transformMessagesToCodexInput,
  transformCodexEventToOpenAI,
  extractAccountIdFromToken,
  type ChatMessage,
  type ToolCallState,
  type ImageUrlContentPart,
} from '../impl/codex-transform'

/**
 * Unit tests for Codex OAuth message transformation functions.
 * 
 * These functions convert between:
 * - AI SDK OpenAI chat format (messages array with role/content)
 * - Codex API format (input array with type/role/content and function_call items)
 * 
 * Key differences:
 * - User messages use content type 'input_text'
 * - Assistant messages use content type 'output_text'
 * - Tool calls become 'function_call' items (not messages)
 * - Tool results become 'function_call_output' items (not role: 'tool' messages)
 * - System messages become 'developer' role (but usually go in 'instructions' field)
 */

// ============================================================================
// transformMessagesToCodexInput Tests
// ============================================================================

describe('transformMessagesToCodexInput', () => {
  describe('basic message conversion', () => {
    test('converts simple user message with string content', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Hello, world!' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: 'Hello, world!' }],
        },
      ])
    })

    test('converts simple assistant message with string content', () => {
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'Hello! How can I help you?' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Hello! How can I help you?' }],
        },
      ])
    })

    test('converts system message to developer role', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'You are a helpful assistant.' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'message',
          role: 'developer',
          content: [{ type: 'input_text', text: 'You are a helpful assistant.' }],
        },
      ])
    })
  })

  describe('content type handling', () => {
    test('user messages use input_text content type', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'Test message' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [{ type: 'input_text' }],
      })
    })

    test('assistant messages use output_text content type', () => {
      const messages: ChatMessage[] = [
        { role: 'assistant', content: 'Test response' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [{ type: 'output_text' }],
      })
    })

    test('developer (system) messages use input_text content type', () => {
      const messages: ChatMessage[] = [
        { role: 'system', content: 'System prompt' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [{ type: 'input_text' }],
      })
    })
  })

  describe('array content handling', () => {
    test('converts array content with text parts for user', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Part 1' },
            { type: 'input_text', text: 'Part 2' },
          ],
        },
      ])
    })

    test('converts array content with text parts for assistant', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Response text' }],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text: 'Response text' }],
        },
      ])
    })

    test('transforms AI SDK image_url format to Codex input_image format', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Look at this image:' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,ABC123==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [
          { type: 'input_text', text: 'Look at this image:' },
          { type: 'input_image', image_url: 'data:image/png;base64,ABC123==' },
        ],
      })
    })

    test('transforms image URL (non-base64) to Codex format', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://example.com/image.png' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [
          { type: 'input_image', image_url: 'https://example.com/image.png' },
        ],
      })
    })

    test('handles message with only image (no text)', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQ==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'data:image/jpeg;base64,/9j/4AAQ==' },
        ],
      })
    })

    test('handles multiple images in one message', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images:' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,IMAGE1==' } } as ImageUrlContentPart,
            { type: 'image_url', image_url: { url: 'data:image/png;base64,IMAGE2==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [
          { type: 'input_text', text: 'Compare these images:' },
          { type: 'input_image', image_url: 'data:image/png;base64,IMAGE1==' },
          { type: 'input_image', image_url: 'data:image/png;base64,IMAGE2==' },
        ],
      })
    })
  })

  describe('image handling', () => {
    test('transforms base64 image to Codex input_image format', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'What is in this image?' },
          { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' },
        ],
      })
    })

    test('transforms HTTPS image URL to Codex format', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this:' },
            { type: 'image_url', image_url: { url: 'https://cdn.example.com/photo.jpg' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [
          { type: 'input_text', text: 'Describe this:' },
          { type: 'input_image', image_url: 'https://cdn.example.com/photo.jpg' },
        ],
      })
    })

    test('handles image-only message without text', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toEqual({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_image', image_url: 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' },
        ],
      })
    })

    test('handles multiple images in conversation', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First image:' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,FIRST==' } } as ImageUrlContentPart,
          ],
        },
        {
          role: 'assistant',
          content: 'I see a cat in the first image.',
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Second image:' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,SECOND==' } } as ImageUrlContentPart,
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(3)
      expect(result[0]).toMatchObject({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'First image:' },
          { type: 'input_image', image_url: 'data:image/png;base64,FIRST==' },
        ],
      })
      expect(result[1]).toMatchObject({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'I see a cat in the first image.' }],
      })
      expect(result[2]).toMatchObject({
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: 'Second image:' },
          { type: 'input_image', image_url: 'data:image/png;base64,SECOND==' },
        ],
      })
    })

    test('handles mixed content types (text, image, text)', () => {
      const messages: ChatMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Here is an image:' },
            { type: 'image_url', image_url: { url: 'data:image/webp;base64,UklGR==' } } as ImageUrlContentPart,
            { type: 'text', text: 'What do you see?' },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        content: [
          { type: 'input_text', text: 'Here is an image:' },
          { type: 'input_image', image_url: 'data:image/webp;base64,UklGR==' },
          { type: 'input_text', text: 'What do you see?' },
        ],
      })
    })
  })

  describe('tool call handling', () => {
    test('converts assistant message with tool calls to function_call items', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_123',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "San Francisco"}',
              },
            },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'function_call',
          call_id: 'call_123',
          name: 'get_weather',
          arguments: '{"location": "San Francisco"}',
        },
      ])
    })

    test('includes assistant text content before tool calls', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: 'Let me check the weather for you.',
          tool_calls: [
            {
              id: 'call_456',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "NYC"}',
              },
            },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Let me check the weather for you.' }],
      })
      expect(result[1]).toEqual({
        type: 'function_call',
        call_id: 'call_456',
        name: 'get_weather',
        arguments: '{"location": "NYC"}',
      })
    })

    test('handles multiple tool calls in one message', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "SF"}',
              },
            },
            {
              id: 'call_2',
              type: 'function',
              function: {
                name: 'get_time',
                arguments: '{"timezone": "PST"}',
              },
            },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(2)
      expect(result[0]).toMatchObject({ type: 'function_call', call_id: 'call_1', name: 'get_weather' })
      expect(result[1]).toMatchObject({ type: 'function_call', call_id: 'call_2', name: 'get_time' })
    })
  })

  describe('tool result handling', () => {
    test('converts tool result message to function_call_output', () => {
      const messages: ChatMessage[] = [
        {
          role: 'tool',
          tool_call_id: 'call_123',
          content: '{"temperature": 72, "conditions": "sunny"}',
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_123',
          output: '{"temperature": 72, "conditions": "sunny"}',
        },
      ])
    })

    test('handles tool result with array content by stringifying', () => {
      const messages: ChatMessage[] = [
        {
          role: 'tool',
          tool_call_id: 'call_789',
          content: [{ type: 'text', text: 'Result text' }],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toEqual([
        {
          type: 'function_call_output',
          call_id: 'call_789',
          output: JSON.stringify([{ type: 'text', text: 'Result text' }]),
        },
      ])
    })

    test('uses "unknown" for missing tool_call_id', () => {
      const messages: ChatMessage[] = [
        {
          role: 'tool',
          content: 'Some result',
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result[0]).toMatchObject({
        type: 'function_call_output',
        call_id: 'unknown',
      })
    })
  })

  describe('multi-turn conversation', () => {
    test('handles complete conversation with user, assistant, and tool calls', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: "What's the weather in SF?" },
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_weather',
              type: 'function',
              function: {
                name: 'get_weather',
                arguments: '{"location": "San Francisco"}',
              },
            },
          ],
        },
        {
          role: 'tool',
          tool_call_id: 'call_weather',
          content: '{"temp": 65, "conditions": "foggy"}',
        },
        { role: 'assistant', content: 'The weather in San Francisco is 65°F and foggy.' },
        { role: 'user', content: 'Thanks!' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(5)
      expect(result[0]).toMatchObject({ type: 'message', role: 'user' })
      expect(result[1]).toMatchObject({ type: 'function_call', name: 'get_weather' })
      expect(result[2]).toMatchObject({ type: 'function_call_output', call_id: 'call_weather' })
      expect(result[3]).toMatchObject({ type: 'message', role: 'assistant' })
      expect(result[4]).toMatchObject({ type: 'message', role: 'user' })
    })
  })

  describe('edge cases', () => {
    test('skips messages with empty content', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: '' },
        { role: 'user', content: 'Hello' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ content: [{ text: 'Hello' }] })
    })

    test('skips messages with empty array content', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: [] },
        { role: 'user', content: 'Hello' },
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(1)
    })

    test('handles empty messages array', () => {
      const result = transformMessagesToCodexInput([])
      expect(result).toEqual([])
    })

    test('handles undefined content gracefully', () => {
      const messages: ChatMessage[] = [
        { role: 'user' }, // no content property
      ]

      const result = transformMessagesToCodexInput(messages)

      expect(result).toHaveLength(0)
    })

    test('ignores non-function tool call types', () => {
      const messages: ChatMessage[] = [
        {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: 'call_1',
              type: 'unknown_type' as 'function',
              function: {
                name: 'test',
                arguments: '{}',
              },
            },
          ],
        },
      ]

      const result = transformMessagesToCodexInput(messages)

      // Should not include the tool call since type is not 'function'
      expect(result).toHaveLength(0)
    })
  })
})

// ============================================================================
// transformCodexEventToOpenAI Tests
// ============================================================================

describe('transformCodexEventToOpenAI', () => {
  const createToolCallState = (modelId = 'gpt-5.1'): ToolCallState => ({
    currentToolCallId: null,
    currentToolCallIndex: 0,
    modelId,
  })

  describe('text delta events', () => {
    test('transforms text delta event to OpenAI chat format', () => {
      const event = {
        type: 'response.output_text.delta',
        delta: 'Hello',
        response_id: 'resp_123',
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.id).toBe('resp_123')
      expect(parsed.object).toBe('chat.completion.chunk')
      expect(parsed.choices[0].delta.content).toBe('Hello')
      expect(parsed.choices[0].finish_reason).toBeNull()
    })

    test('uses default id when response_id is missing', () => {
      const event = {
        type: 'response.output_text.delta',
        delta: 'World',
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.id).toBe('chatcmpl-codex')
    })

    test('returns null when delta is missing', () => {
      const event = {
        type: 'response.output_text.delta',
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull()
    })
  })

  describe('function call events', () => {
    test('transforms function call added event', () => {
      const event = {
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_abc123',
          name: 'get_weather',
        },
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.choices[0].delta.tool_calls).toBeDefined()
      expect(parsed.choices[0].delta.tool_calls[0]).toMatchObject({
        index: 0,
        id: 'call_abc123',
        type: 'function',
        function: {
          name: 'get_weather',
          arguments: '',
        },
      })
    })

    test('updates toolCallState when function call is added', () => {
      const event = {
        type: 'response.output_item.added',
        item: {
          type: 'function_call',
          call_id: 'call_xyz',
          name: 'test_func',
        },
      }
      const state = createToolCallState()

      transformCodexEventToOpenAI(event, state)

      expect(state.currentToolCallId).toBe('call_xyz')
    })

    test('transforms function call arguments delta', () => {
      const event = {
        type: 'response.function_call_arguments.delta',
        delta: '{"location":',
      }
      const state = createToolCallState()
      state.currentToolCallIndex = 0

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.choices[0].delta.tool_calls[0].function.arguments).toBe('{"location":')
    })

    test('increments toolCallIndex on function call done', () => {
      const event = {
        type: 'response.function_call_arguments.done',
      }
      const state = createToolCallState()
      state.currentToolCallIndex = 0

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull() // Should not emit anything
      expect(state.currentToolCallIndex).toBe(1)
    })

    test('ignores non-function_call output items', () => {
      const event = {
        type: 'response.output_item.added',
        item: {
          type: 'text',
          content: 'some text',
        },
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull()
    })
  })

  describe('completion events', () => {
    test('transforms response.completed event with stop finish reason', () => {
      const event = {
        type: 'response.completed',
        response: {
          id: 'resp_final',
          model: 'gpt-5.2-codex',
          output: [{ type: 'text', content: 'Hello' }],
        },
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.id).toBe('resp_final')
      expect(parsed.model).toBe('gpt-5.2-codex')
      expect(parsed.choices[0].delta).toEqual({})
      expect(parsed.choices[0].finish_reason).toBe('stop')
    })

    test('uses tool_calls finish reason when output contains function_call', () => {
      const event = {
        type: 'response.completed',
        response: {
          id: 'resp_tool',
          output: [
            { type: 'function_call', name: 'get_weather' },
          ],
        },
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.choices[0].finish_reason).toBe('tool_calls')
    })

    test('handles response.done event same as response.completed', () => {
      const event = {
        type: 'response.done',
        response: {
          id: 'resp_done',
        },
      }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).not.toBeNull()
      const parsed = JSON.parse(result!.replace('data: ', '').trim())
      expect(parsed.id).toBe('resp_done')
      expect(parsed.choices[0].finish_reason).toBe('stop')
    })
  })

  describe('ignored events', () => {
    test('returns null for response.created event', () => {
      const event = { type: 'response.created' }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull()
    })

    test('returns null for response.in_progress event', () => {
      const event = { type: 'response.in_progress' }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull()
    })

    test('returns null for unknown event types', () => {
      const event = { type: 'unknown.event.type' }
      const state = createToolCallState()

      const result = transformCodexEventToOpenAI(event, state)

      expect(result).toBeNull()
    })
  })
})

// ============================================================================
// extractAccountIdFromToken Tests
// ============================================================================

describe('extractAccountIdFromToken', () => {
  // Helper to create a mock JWT token
  const createMockJWT = (payload: Record<string, unknown>): string => {
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = 'mock_signature'
    return `${header}.${payloadBase64}.${signature}`
  }

  test('extracts account ID from valid JWT with chatgpt_account_id claim', () => {
    const token = createMockJWT({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct_123456789',
      },
    })

    const result = extractAccountIdFromToken(token)

    expect(result).toBe('acct_123456789')
  })

  test('returns null when JWT is missing auth claim', () => {
    const token = createMockJWT({
      sub: 'user_123',
      email: 'test@example.com',
    })

    const result = extractAccountIdFromToken(token)

    expect(result).toBeNull()
  })

  test('returns null when auth claim is missing chatgpt_account_id', () => {
    const token = createMockJWT({
      'https://api.openai.com/auth': {
        organization_id: 'org_123',
      },
    })

    const result = extractAccountIdFromToken(token)

    expect(result).toBeNull()
  })

  test('returns null for token with wrong number of parts', () => {
    expect(extractAccountIdFromToken('not.a.valid.jwt.token')).toBeNull()
    expect(extractAccountIdFromToken('toofew.parts')).toBeNull()
    expect(extractAccountIdFromToken('')).toBeNull()
  })

  test('returns null for invalid base64 in payload', () => {
    const token = 'header.!!!invalid_base64!!!.signature'

    const result = extractAccountIdFromToken(token)

    expect(result).toBeNull()
  })

  test('returns null for invalid JSON in payload', () => {
    const header = Buffer.from('{}').toString('base64url')
    const invalidPayload = Buffer.from('not json').toString('base64url')
    const token = `${header}.${invalidPayload}.signature`

    const result = extractAccountIdFromToken(token)

    expect(result).toBeNull()
  })

  test('handles chatgpt_account_id with various formats', () => {
    // UUID format
    const uuidToken = createMockJWT({
      'https://api.openai.com/auth': {
        chatgpt_account_id: '550e8400-e29b-41d4-a716-446655440000',
      },
    })
    expect(extractAccountIdFromToken(uuidToken)).toBe('550e8400-e29b-41d4-a716-446655440000')

    // Prefixed format
    const prefixedToken = createMockJWT({
      'https://api.openai.com/auth': {
        chatgpt_account_id: 'acct_abc123xyz',
      },
    })
    expect(extractAccountIdFromToken(prefixedToken)).toBe('acct_abc123xyz')
  })
})
