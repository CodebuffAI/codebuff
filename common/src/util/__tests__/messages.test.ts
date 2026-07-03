import { describe, expect, it, test } from 'bun:test'
import { cloneDeep } from 'lodash'

import {
  withCacheControl,
  withoutCacheControl,
  convertCbToModelMessages,
  getCacheAnchorSummary,
  systemMessage,
  userMessage,
  assistantMessage,
  jsonToolResult,
  mediaToolResult,
} from '../messages'

import type { Message } from '../../types/messages/codebuff-message'
import type { ToolResultPart } from 'ai'

// Test helper types for provider options with cache control
type CacheControlValue = { type: string }
type ProviderWithCacheControl = Record<string, unknown> & {
  cache_control?: CacheControlValue
}

describe('withCacheControl', () => {
  it('should add cache control to object without providerOptions', () => {
    const obj = {} as Parameters<typeof withCacheControl>[0]
    const result = withCacheControl(obj)

    expect(result.providerOptions).toBeDefined()
    const resultOptions = result.providerOptions as Record<string, ProviderWithCacheControl>
    expect(resultOptions.anthropic?.cache_control).toEqual({
      type: 'ephemeral',
    })
    expect(resultOptions.openrouter?.cache_control).toEqual({
      type: 'ephemeral',
    })
    expect(resultOptions.openaiCompatible?.cache_control).toEqual({
      type: 'ephemeral',
    })
  })

  it('should add cache control to existing providerOptions', () => {
    const obj = {
      providerOptions: {
        anthropic: { someOtherOption: 'value' },
      },
    } as Parameters<typeof withCacheControl>[0]
    const result = withCacheControl(obj)

    const resultAnthropicOptions = result.providerOptions?.anthropic as ProviderWithCacheControl
    expect(resultAnthropicOptions.cache_control).toEqual({
      type: 'ephemeral',
    })
    expect(resultAnthropicOptions.someOtherOption).toBe(
      'value',
    )
  })

  it('should not mutate original object', () => {
    const original = {} as Parameters<typeof withCacheControl>[0]
    const result = withCacheControl(original)

    expect(original.providerOptions).toBeUndefined()
    expect(result.providerOptions).toBeDefined()
  })

  it('should handle all three providers', () => {
    const obj = {} as Parameters<typeof withCacheControl>[0]
    const result = withCacheControl(obj)

    const resultOptions = result.providerOptions as Record<string, ProviderWithCacheControl>
    expect(resultOptions.anthropic?.cache_control?.type).toBe('ephemeral')
    expect(resultOptions.openrouter?.cache_control?.type).toBe('ephemeral')
    expect(resultOptions.openaiCompatible?.cache_control?.type).toBe('ephemeral')
  })
})

describe('withoutCacheControl', () => {
  it('should remove cache control from all providers', () => {
    const obj = {
      id: 'test',
      providerOptions: {
        anthropic: { cache_control: { type: 'ephemeral' } },
        openrouter: { cache_control: { type: 'ephemeral' } },
        openaiCompatible: { cache_control: { type: 'ephemeral' } },
      },
    }
    const result = withoutCacheControl(obj)

    expect(result.providerOptions).toBeUndefined()
  })

  it('should preserve other provider options', () => {
    const obj = {
      id: 'test',
      providerOptions: {
        anthropic: {
          cache_control: { type: 'ephemeral' },
          otherOption: 'value',
        },
      },
    }
    const result = withoutCacheControl(obj)

    expect(result.providerOptions?.anthropic?.cache_control).toBeUndefined()
    expect(result.providerOptions?.anthropic?.otherOption).toBe('value')
  })

  it('should not mutate original object', () => {
    const original = {
      id: 'test',
      providerOptions: {
        anthropic: { cache_control: { type: 'ephemeral' } },
      },
    }
    const result = withoutCacheControl(original)

    expect(original.providerOptions?.anthropic?.cache_control).toBeDefined()
    expect(result.providerOptions?.anthropic?.cache_control).toBeUndefined()
  })

  it('should handle object with no cache control', () => {
    const obj = {} as Parameters<typeof withoutCacheControl>[0]
    const result = withoutCacheControl(obj)

    expect(result.providerOptions).toBeUndefined()
  })

  it('should clean up empty provider objects', () => {
    const obj = {
      id: 'test',
      providerOptions: {
        anthropic: { cache_control: { type: 'ephemeral' } },
      },
    }
    const result = withoutCacheControl(obj)

    expect(result.providerOptions).toBeUndefined()
  })
})

describe('convertCbToModelMessages', () => {
  describe('basic message conversion', () => {
    it('should convert system messages', () => {
      const messages: Message[] = [systemMessage('You are a helpful assistant')]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'system',
          content: 'You are a helpful assistant',
        },
      ])
    })

    it('should convert user messages with array content', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'First part' },
            { type: 'text', text: 'Second part' },
          ],
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'First part',
            },
            {
              type: 'text',
              text: 'Second part',
            },
          ],
        },
      ])
    })
  })

  describe('tool message conversion', () => {
    it('should convert tool messages with JSON output', () => {
      const messages: Message[] = [
        assistantMessage({
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'test_tool',
          input: {},
        }),
        {
          role: 'tool',
          toolName: 'test_tool',
          toolCallId: 'call_123',
          content: jsonToolResult({ result: 'success' }),
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        expect.objectContaining({
          role: 'assistant',
          content: [
            expect.objectContaining({
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'test_tool',
            }),
          ],
        }),
        expect.objectContaining({
          role: 'tool',
          content: [
            expect.objectContaining({
              type: 'tool-result',
              toolCallId: 'call_123',
              toolName: 'test_tool',
              output: { type: 'json', value: { result: 'success' } },
            } satisfies ToolResultPart),
          ],
        }),
      ])
    })

    it('should drop JSON tool messages without a matching assistant tool call', () => {
      const messages: Message[] = [
        userMessage('Before orphan tool result'),
        {
          role: 'tool',
          toolName: 'test_tool',
          toolCallId: 'orphan_call',
          content: jsonToolResult({ result: 'orphaned' }),
        },
        userMessage('After orphan tool result'),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({ text: 'Before orphan tool result' }),
            expect.objectContaining({ text: 'After orphan tool result' }),
          ],
        }),
      ])
    })

    it('should sanitize undefined values from JSON tool output', () => {
      const content = jsonToolResult({
        result: 'success',
        dropped: undefined,
        nested: {
          kept: true,
          alsoDropped: undefined,
        },
        list: [1, undefined, { value: 'kept', dropped: undefined }],
        nonFinite: Number.NaN,
      } as any)

      expect(content).toEqual([
        {
          type: 'json',
          value: {
            result: 'success',
            nested: { kept: true },
            list: [1, null, { value: 'kept' }],
            nonFinite: null,
          },
        },
      ])

      const messages: Message[] = [
        assistantMessage({
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'test_tool',
          input: {},
        }),
        {
          role: 'tool',
          toolName: 'test_tool',
          toolCallId: 'call_123',
          content,
        },
      ]

      expect(() =>
        convertCbToModelMessages({
          messages,
          includeCacheControl: false,
        }),
      ).not.toThrow()
    })

    it('should preserve tool media output as user file input', () => {
      const messages: Message[] = [
        {
          role: 'tool',
          toolName: 'test_tool',
          toolCallId: 'call_123',
          content: mediaToolResult({
            data: 'base64data',
            mediaType: 'image/png',
          }),
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        expect.objectContaining({
          role: 'user',
          content: [
            expect.objectContaining({
              type: 'file',
            }),
          ],
        }),
      ])
    })

    it('should convert tool messages with empty content', () => {
      const messages: Message[] = [
        assistantMessage({
          type: 'tool-call',
          toolCallId: 'call_empty',
          toolName: 'scraper_page_to_markdown',
          input: {},
        }),
        {
          role: 'tool',
          toolName: 'scraper_page_to_markdown',
          toolCallId: 'call_empty',
          content: [],
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        expect.objectContaining({
          role: 'assistant',
          content: [
            expect.objectContaining({
              type: 'tool-call',
              toolCallId: 'call_empty',
              toolName: 'scraper_page_to_markdown',
            }),
          ],
        }),
        expect.objectContaining({
          role: 'tool',
          toolCallId: 'call_empty',
          toolName: 'scraper_page_to_markdown',
          content: [
            expect.objectContaining({
              type: 'tool-result',
              toolCallId: 'call_empty',
              toolName: 'scraper_page_to_markdown',
              output: { type: 'json', value: '' },
            } satisfies ToolResultPart),
          ],
        }),
      ])
    })

    it('should handle multiple tool outputs', () => {
      const messages: Message[] = [
        assistantMessage({
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'test_tool',
          input: {},
        }),
        {
          role: 'tool',
          toolName: 'test_tool',
          toolCallId: 'call_123',
          content: [
            { type: 'json', value: { result1: 'success' } },
            { type: 'json', value: { result2: 'also success' } },
          ],
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      // Multiple JSON outputs for one tool call stay in the same response block.
      expect(result).toEqual([
        expect.objectContaining({
          role: 'assistant',
        }),
        expect.objectContaining({
          role: 'tool',
        }),
        expect.objectContaining({
          role: 'tool',
        }),
      ])
    })
  })

  describe('message aggregation', () => {
    it('should aggregate consecutive system messages', () => {
      const messages: Message[] = [
        systemMessage({ content: 'First system message' }),
        systemMessage({ content: 'Second system message' }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'system',
          content: 'First system message\n\nSecond system message',
        },
      ])
    })

    it('should aggregate consecutive user messages', () => {
      const messages: Message[] = [
        userMessage('First user message'),
        userMessage('Second user message'),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'First user message',
            },
            {
              type: 'text',
              text: 'Second user message',
            },
          ],
          sentAt: expect.any(Number),
        },
      ])
    })

    it('should aggregate consecutive assistant messages', () => {
      const messages: Message[] = [
        assistantMessage('First assistant message'),
        assistantMessage('Second assistant message'),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'First assistant message',
            },
            {
              type: 'text',
              text: 'Second assistant message',
            },
          ],
          sentAt: expect.any(Number),
        },
      ])
    })

    it('should not aggregate messages with different timeToLive', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          timeToLive: 'agentStep',
        },

        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          timeToLive: 'userPrompt',
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          timeToLive: 'agentStep',
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          timeToLive: 'userPrompt',
        },
      ])
    })

    it('should not aggregate messages with different providerOptions', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          providerOptions: { anthropic: { option1: 'value1' } },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          providerOptions: { anthropic: { option1: 'value2' } },
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          providerOptions: { anthropic: { option1: 'value1' } },
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          providerOptions: { anthropic: { option1: 'value2' } },
        },
      ])
    })

    it('should not aggregate messages with different tags', () => {
      const messages: Message[] = [
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          tags: ['tag1'],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          tags: ['tag2'],
        },
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'user',
          content: [{ type: 'text', text: 'First' }],
          tags: ['tag1'],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Second' }],
          tags: ['tag2'],
        },
      ])
    })
  })

  describe('cache control', () => {
    // Note: Cache control is applied to content parts within messages, not to the messages themselves.
    // The implementation splits text content and adds cache control to specific parts based on tagged prompts.
    test('should add cache control when includeCacheControl is true', () => {
      const messages: Message[] = [
        systemMessage('System message'),
        userMessage('Context message'),
        assistantMessage('Response'),
        userMessage({
          content: 'User message',
          tags: ['USER_PROMPT'],
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // Cache control is on content parts of the assistant message (result[2])
      if (
        typeof result[2].content !== 'string' &&
        result[2].content.length > 0
      ) {
        const lastContentPart = result[2].content[result[2].content.length - 1] as { providerOptions?: Record<string, ProviderWithCacheControl> }
        expect(
          lastContentPart.providerOptions?.anthropic?.cache_control,
        ).toEqual({
          type: 'ephemeral',
        })
      }
    })

    it('should not add cache control when includeCacheControl is false', () => {
      const messages: Message[] = [
        systemMessage('System message'),
        userMessage({
          content: 'User message',
          tags: ['USER_PROMPT'],
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result[0].providerOptions).toBeUndefined()
    })

    test('should add cache control before USER_PROMPT tag', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('More context'),
        userMessage({
          content: 'User prompt',
          tags: ['USER_PROMPT'],
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // Cache control should be on content part before USER_PROMPT
      expect(result).toEqual([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant' }),
        {
          role: 'user',
          sentAt: expect.any(Number),
          content: [
            {
              type: 'text',
              text: 'More context',
              providerOptions: expect.objectContaining({
                openaiCompatible: {
                  cache_control: {
                    type: 'ephemeral',
                  },
                },
              }),
            },
          ],
        },
        expect.objectContaining({ role: 'user' }),
      ])
    })

    // M2: LAST_ASSISTANT_MESSAGE tag no longer receives its own anchor.
    // The stable-prefix strategy anchors on system + stable-history + tail
    // instead. This test verifies the new behavior: with no live-prompt tag,
    // the system message and the last message (tail) receive cache control.
    test('M2: LAST_ASSISTANT_MESSAGE tag no longer drives anchoring — system + tail anchor instead', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('Instructions'),
        assistantMessage({
          content: 'Second response',
          tags: ['LAST_ASSISTANT_MESSAGE'],
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // System message (index 0) gets cache control
      expect(result[0].providerOptions).toEqual(
        expect.objectContaining({
          openaiCompatible: { cache_control: { type: 'ephemeral' } },
        }),
      )

      // Last message (tail, index 4) gets cache control on its last content part
      const lastMessage = result[4]
      expect(lastMessage.role).toBe('assistant')
      if (typeof lastMessage.content !== 'string') {
        const lastPart = lastMessage.content[lastMessage.content.length - 1] as {
          providerOptions?: Record<string, ProviderWithCacheControl>
        }
        expect(lastPart.providerOptions?.openaiCompatible?.cache_control).toEqual({
          type: 'ephemeral',
        })
      }

      // No anchor before the LAST_ASSISTANT_MESSAGE tag (the 'Instructions' user message stays clean)
      const instructionsMsg = result[3]
      if (typeof instructionsMsg.content !== 'string') {
        const part = instructionsMsg.content[0] as {
          providerOptions?: Record<string, ProviderWithCacheControl>
        }
        expect(part.providerOptions?.openaiCompatible?.cache_control).toBeUndefined()
      }
    })

    // M2: stable-history boundary anchor. With a USER_PROMPT tag, the message
    // before it (stable history) gets cache control, plus system + tail.
    test('M2: stable-history anchor before earliest live-prompt tag + system + tail', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('More context'),
        userMessage({ content: 'User prompt', tags: ['USER_PROMPT'] }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // System (index 0): cache control
      expect(result[0].providerOptions).toEqual(
        expect.objectContaining({
          openaiCompatible: { cache_control: { type: 'ephemeral' } },
        }),
      )

      // Stable-history boundary (index 3, 'More context'): cache control
      expect(result[3]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'More context',
              providerOptions: expect.objectContaining({
                openaiCompatible: { cache_control: { type: 'ephemeral' } },
              }),
            },
          ],
        }),
      )

      // Tail (index 4, 'User prompt'): cache control
      expect(result[4]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'User prompt',
              providerOptions: expect.objectContaining({
                openaiCompatible: { cache_control: { type: 'ephemeral' } },
              }),
            },
          ],
        }),
      )
    })

    // M2: earliest live-prompt wins. If both STEP_PROMPT and USER_PROMPT
    // exist, the stable-history anchor goes before the earliest one.
    test('M2: earliest live-prompt tag wins for stable-history boundary', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        userMessage({ content: 'Step', tags: ['STEP_PROMPT'] }),
        assistantMessage('Response'),
        userMessage({ content: 'User prompt', tags: ['USER_PROMPT'] }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // Stable-history boundary is before STEP_PROMPT (index 1, 'Context')
      expect(result[1]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Context',
              providerOptions: expect.objectContaining({
                openaiCompatible: { cache_control: { type: 'ephemeral' } },
              }),
            },
          ],
        }),
      )
    })

    // M2: set-dedup — if system is also the tail (single message), only one anchor
    test('M2: set-dedup prevents double anchoring when system is also tail', () => {
      const messages: Message[] = [systemMessage('Lonely system')]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      expect(result).toHaveLength(1)
      expect(result[0].providerOptions).toEqual(
        expect.objectContaining({
          openaiCompatible: { cache_control: { type: 'ephemeral' } },
        }),
      )
    })

    test('should add cache control before STEP_PROMPT tag', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('More context'),
        userMessage({ content: 'Step', tags: ['STEP_PROMPT'] }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      expect(result).toEqual([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant' }),
        {
          role: 'user',
          sentAt: expect.any(Number),
          content: [
            {
              type: 'text',
              text: 'More context',
              providerOptions: expect.objectContaining({
                openaiCompatible: {
                  cache_control: {
                    type: 'ephemeral',
                  },
                },
              }),
            },
          ],
        },
        expect.objectContaining({ role: 'user' }),
      ])
    })

    test('should add cache control to last message', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('More context'),
        userMessage('User message'),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // Cache control is on content parts in the assistant message
      expect(result).toEqual([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant' }),
        {
          role: 'user',
          sentAt: expect.any(Number),
          content: [
            { type: 'text', text: 'More context' },
            {
              type: 'text',
              text: 'User message',
              providerOptions: expect.objectContaining({
                openaiCompatible: {
                  cache_control: {
                    type: 'ephemeral',
                  },
                },
              }),
            },
          ],
        },
      ])
    })

    test('should handle system messages with cache control', () => {
      const messages: Message[] = [
        systemMessage('Long system prompt'),
        userMessage({ content: 'User', tags: ['USER_PROMPT'] }),
        assistantMessage('Response'),
        userMessage('User 2'),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      expect(result).toEqual([
        {
          role: 'system',
          content: 'Long system prompt',
          providerOptions: expect.objectContaining({
            openaiCompatible: {
              cache_control: {
                type: 'ephemeral',
              },
            },
          }),
        },
        expect.objectContaining({ role: 'user' }),
        expect.objectContaining({ role: 'assistant' }),
        expect.objectContaining({ role: 'user' }),
      ])
    })

  // M2 telemetry: getCacheAnchorSummary returns per-anchor metadata without
  // modifying messages. Used by cache-debug snapshots to detect anchor churn.
  describe('getCacheAnchorSummary (M2 telemetry)', () => {
    it('returns system + stable-history + tail anchors with content hashes', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        assistantMessage('Response'),
        userMessage('More context'),
        userMessage({ content: 'User prompt', tags: ['USER_PROMPT'] }),
      ]

      const anchors = getCacheAnchorSummary(messages)

      expect(anchors).toHaveLength(3)
      expect(anchors.map((a) => a.type)).toEqual([
        'system',
        'stable-history',
        'tail',
      ])
      // system anchor at index 0
      expect(anchors[0].index).toBe(0)
      expect(anchors[0].contentHash).toMatch(/^[0-9a-f]{8}$/)
      // stable-history anchor before USER_PROMPT (index 3)
      expect(anchors[1].index).toBe(3)
      // tail anchor at last index (4)
      expect(anchors[2].index).toBe(4)
      // each anchor has a reason string
      for (const anchor of anchors) {
        expect(anchor.reason).toBeTruthy()
        expect(typeof anchor.reason).toBe('string')
      }
    })

    it('does not modify the original messages', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage('Context'),
        userMessage({ content: 'User prompt', tags: ['USER_PROMPT'] }),
      ]

      const before = cloneDeep(messages)
      getCacheAnchorSummary(messages)
      expect(messages).toEqual(before)
    })

    it('dedupes when system is also the tail (single message)', () => {
      const messages: Message[] = [systemMessage('Lonely system')]

      const anchors = getCacheAnchorSummary(messages)

      expect(anchors).toHaveLength(1)
      expect(anchors[0].type).toBe('system')
      expect(anchors[0].index).toBe(0)
    })

    it('returns empty for empty messages', () => {
      expect(getCacheAnchorSummary([])).toEqual([])
    })
  })

    it('should handle array content with cache control on non-text parts', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage([
          { type: 'text', text: 'Context' },
          { type: 'file', data: 'base64', mediaType: 'image/png' },
        ]),
        userMessage({ content: 'Next', tags: ['USER_PROMPT'] }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      // Should add cache control to the file part (last non-text part)
      expect(result).toEqual([
        expect.objectContaining({ role: 'system' }),
        {
          role: 'user',
          sentAt: expect.any(Number),
          content: [
            {
              type: 'text',
              text: 'Context',
            },
            {
              type: 'file',
              data: 'base64',
              mediaType: 'image/png',
              providerOptions: expect.objectContaining({
                openaiCompatible: {
                  cache_control: {
                    type: 'ephemeral',
                  },
                },
              }),
            },
          ],
        },
        expect.objectContaining({ role: 'user' }),
      ])
    })

    it('should handle very short text content when finding cache control location', () => {
      const messages: Message[] = [
        systemMessage('System'),
        userMessage([
          { type: 'text', text: 'Longer text' },
          { type: 'text', text: 'X' }, // Short
        ]),
        userMessage({ content: 'Next', tags: ['USER_PROMPT'] }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: true,
      })

      expect(result).toEqual([
        expect.objectContaining({ role: 'system' }),
        {
          role: 'user',
          sentAt: expect.any(Number),
          content: [
            { type: 'text', text: 'Longer text' },
            {
              type: 'text',
              text: 'X',
              providerOptions: expect.objectContaining({
                openaiCompatible: {
                  cache_control: {
                    type: 'ephemeral',
                  },
                },
              }),
            },
          ],
        },
        expect.objectContaining({ role: 'user' }),
      ])
    })
  })

  describe('edge cases', () => {
    it('should handle empty messages array', () => {
      const result = convertCbToModelMessages({
        messages: [],
        includeCacheControl: false,
      })

      expect(result).toHaveLength(0)
    })

    it('should handle tool-call content in assistant messages', () => {
      const messages: Message[] = [
        assistantMessage({
          type: 'tool-call',
          toolCallId: 'call_123',
          toolName: 'test_tool',
          input: { param: 'value' },
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      expect(result).toEqual([
        {
          role: 'assistant',
          sentAt: expect.any(Number),
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call_123',
              toolName: 'test_tool',
              input: { param: 'value' },
            },
          ],
        },
      ])
    })

    it('should preserve message metadata during conversion', () => {
      const messages: Message[] = [
        userMessage({
          content: 'Test',
          tags: ['custom_tag'],
          timeToLive: 'agentStep',
          providerOptions: { anthropic: { someOption: 'value' } },
        }),
      ]

      const result = convertCbToModelMessages({
        messages,
        includeCacheControl: false,
      })

      const resultMessage = result[0] as { tags?: string[]; timeToLive?: string; providerOptions?: Record<string, ProviderWithCacheControl> }
      expect(resultMessage.tags).toEqual(['custom_tag'])
      expect(resultMessage.timeToLive).toBe('agentStep')
      expect((resultMessage.providerOptions?.anthropic as ProviderWithCacheControl)?.someOption).toBe(
        'value',
      )
    })

    it('should not mutate original messages', () => {
      const originalMessages: Message[] = [
        systemMessage('Original'),
        userMessage('User message'),
      ]
      const messagesCopy = cloneDeep(originalMessages)

      convertCbToModelMessages({
        messages: originalMessages,
        includeCacheControl: true,
      })

      expect(originalMessages).toEqual(messagesCopy)
    })
  })
})
