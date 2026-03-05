import { describe, expect, it } from 'bun:test'

import {
  convertContentToAnthropic,
  convertToAnthropicMessages,
  convertToResponsesApiInput,
  countTokensViaOpenAI,
  formatToolContent,
} from '../_post'

describe('convertContentToAnthropic', () => {
  describe('image handling', () => {
    it('converts base64 image with image field correctly', () => {
      const content = [
        {
          type: 'image',
          image: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
          mediaType: 'image/png',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ',
          },
        },
      ])
    })

    it('uses default media type when not provided', () => {
      const content = [
        {
          type: 'image',
          image: 'base64data',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'base64data',
          },
        },
      ])
    })

    it('converts URL-based image with http://', () => {
      const content = [
        {
          type: 'image',
          image: 'http://example.com/image.png',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'url',
            url: 'http://example.com/image.png',
          },
        },
      ])
    })

    it('converts URL-based image with https://', () => {
      const content = [
        {
          type: 'image',
          image: 'https://example.com/image.jpg',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'url',
            url: 'https://example.com/image.jpg',
          },
        },
      ])
    })

    it('skips images with missing image field', () => {
      const content = [
        {
          type: 'image',
          // No image field - this was the bug!
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toBeUndefined()
    })

    it('skips images with empty string image field', () => {
      const content = [
        {
          type: 'image',
          image: '',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toBeUndefined()
    })

    it('skips images with null image field', () => {
      const content = [
        {
          type: 'image',
          image: null,
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toBeUndefined()
    })

    it('does not use legacy data/mimeType fields (regression test)', () => {
      // This was the original bug - code was looking at part.data/mimeType
      // instead of part.image/mediaType
      const content = [
        {
          type: 'image',
          data: 'base64data', // old incorrect field
          mimeType: 'image/png', // old incorrect field
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      // Should skip since 'image' field is missing
      expect(result).toBeUndefined()
    })

    it('handles data: URI as base64 (not URL)', () => {
      const content = [
        {
          type: 'image',
          image: 'data:image/png;base64,iVBORw0KGgo=',
          mediaType: 'image/png',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      // data: URIs don't start with http/https, so treated as base64
      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'data:image/png;base64,iVBORw0KGgo=',
          },
        },
      ])
    })

    it('handles mixed content with valid image and text', () => {
      const content = [
        { type: 'text', text: 'Check this image:' },
        {
          type: 'image',
          image: 'base64imagedata',
          mediaType: 'image/jpeg',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        { type: 'text', text: 'Check this image:' },
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/jpeg',
            data: 'base64imagedata',
          },
        },
      ])
    })

    it('handles mixed content with invalid image (skips only the invalid image)', () => {
      const content = [
        { type: 'text', text: 'Some text' },
        {
          type: 'image',
          // Missing image field
        },
        { type: 'text', text: 'More text' },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        { type: 'text', text: 'Some text' },
        { type: 'text', text: 'More text' },
      ])
    })

    it('handles multiple valid images', () => {
      const content = [
        {
          type: 'image',
          image: 'image1data',
          mediaType: 'image/png',
        },
        {
          type: 'image',
          image: 'https://example.com/image2.jpg',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: 'image/png',
            data: 'image1data',
          },
        },
        {
          type: 'image',
          source: {
            type: 'url',
            url: 'https://example.com/image2.jpg',
          },
        },
      ])
    })
  })

  describe('text handling', () => {
    it('converts simple string content', () => {
      const result = convertContentToAnthropic('Hello world', 'user')
      expect(result).toBe('Hello world')
    })

    it('converts text parts', () => {
      const content = [{ type: 'text', text: 'Hello' }]
      const result = convertContentToAnthropic(content, 'user')
      expect(result).toEqual([{ type: 'text', text: 'Hello' }])
    })

    it('skips empty text parts', () => {
      const content = [
        { type: 'text', text: '   ' },
        { type: 'text', text: 'Valid text' },
      ]
      const result = convertContentToAnthropic(content, 'user')
      expect(result).toEqual([{ type: 'text', text: 'Valid text' }])
    })
  })

  describe('tool-call handling', () => {
    it('converts tool-call for assistant role', () => {
      const content = [
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'read_file',
          input: { path: 'test.ts' },
        },
      ]

      const result = convertContentToAnthropic(content, 'assistant')

      expect(result).toEqual([
        {
          type: 'tool_use',
          id: 'call-123',
          name: 'read_file',
          input: { path: 'test.ts' },
        },
      ])
    })

    it('skips tool-call for user role', () => {
      const content = [
        {
          type: 'tool-call',
          toolCallId: 'call-123',
          toolName: 'read_file',
          input: { path: 'test.ts' },
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toBeUndefined()
    })
  })

  describe('json handling', () => {
    it('converts json parts with object value', () => {
      const content = [
        {
          type: 'json',
          value: { key: 'value' },
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([{ type: 'text', text: '{"key":"value"}' }])
    })

    it('converts json parts with string value', () => {
      const content = [
        {
          type: 'json',
          value: 'string value',
        },
      ]

      const result = convertContentToAnthropic(content, 'user')

      expect(result).toEqual([{ type: 'text', text: 'string value' }])
    })
  })
})

describe('convertToAnthropicMessages', () => {
  it('skips system messages', () => {
    const messages = [
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hello' },
    ]

    const result = convertToAnthropicMessages(messages)

    expect(result).toEqual([{ role: 'user', content: 'Hello' }])
  })

  it('converts tool messages to user messages with tool_result', () => {
    const messages = [
      {
        role: 'tool',
        toolCallId: 'call-123',
        content: 'Tool output here',
      },
    ]

    const result = convertToAnthropicMessages(messages)

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'call-123',
            content: 'Tool output here',
          },
        ],
      },
    ])
  })

  it('handles user messages with image content', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this' },
          {
            type: 'image',
            image: 'base64data',
            mediaType: 'image/png',
          },
        ],
      },
    ]

    const result = convertToAnthropicMessages(messages)

    expect(result).toEqual([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Look at this' },
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/png',
              data: 'base64data',
            },
          },
        ],
      },
    ])
  })

  it('skips messages with empty content after conversion', () => {
    const messages = [
      {
        role: 'user',
        content: [{ type: 'image' }], // Invalid image, will be skipped
      },
      {
        role: 'user',
        content: 'Valid message',
      },
    ]

    const result = convertToAnthropicMessages(messages)

    expect(result).toEqual([{ role: 'user', content: 'Valid message' }])
  })
})

describe('convertToResponsesApiInput', () => {
  it('converts a simple user message', () => {
    const result = convertToResponsesApiInput([
      { role: 'user', content: 'Hello world' },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'user', content: 'Hello world' },
    ])
  })

  it('maps system messages to developer role', () => {
    const result = convertToResponsesApiInput([
      { role: 'system', content: 'You are helpful' },
      { role: 'user', content: 'Hi' },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'developer', content: 'You are helpful' },
      { type: 'message', role: 'user', content: 'Hi' },
    ])
  })

  it('converts tool messages to function_call_output', () => {
    const result = convertToResponsesApiInput([
      { role: 'tool', toolCallId: 'call-1', content: 'File contents here' },
    ])
    expect(result).toEqual([
      { type: 'function_call_output', call_id: 'call-1', output: 'File contents here' },
    ])
  })

  it('uses unknown call_id when toolCallId is missing', () => {
    const result = convertToResponsesApiInput([
      { role: 'tool', content: 'Some output' },
    ])
    expect(result).toEqual([
      { type: 'function_call_output', call_id: 'unknown', output: 'Some output' },
    ])
  })

  it('converts assistant messages', () => {
    const result = convertToResponsesApiInput([
      { role: 'assistant', content: 'I can help with that.' },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'assistant', content: 'I can help with that.' },
    ])
  })

  it('handles array content with text parts', () => {
    const result = convertToResponsesApiInput([
      {
        role: 'user',
        content: [{ type: 'text', text: 'What is TypeScript?' }],
      },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'user', content: 'What is TypeScript?' },
    ])
  })

  it('converts tool-call content to function_call items', () => {
    const result = convertToResponsesApiInput([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-1',
            toolName: 'read_file',
            input: { path: 'src/index.ts' },
          },
        ],
      },
    ])
    expect(result).toEqual([
      {
        type: 'function_call',
        id: 'call-1',
        name: 'read_file',
        arguments: '{"path":"src/index.ts"}',
      },
    ])
  })

  it('splits assistant messages with text and tool-calls', () => {
    const result = convertToResponsesApiInput([
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Let me read that file.' },
          {
            type: 'tool-call',
            toolCallId: 'call-2',
            toolName: 'read_file',
            input: { path: 'test.ts' },
          },
        ],
      },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'assistant', content: 'Let me read that file.' },
      {
        type: 'function_call',
        id: 'call-2',
        name: 'read_file',
        arguments: '{"path":"test.ts"}',
      },
    ])
  })

  it('handles json content parts', () => {
    const result = convertToResponsesApiInput([
      {
        role: 'user',
        content: [{ type: 'json', value: { key: 'value' } }],
      },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'user', content: '{"key":"value"}' },
    ])
  })

  it('converts a multi-turn conversation', () => {
    const result = convertToResponsesApiInput([
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
      { role: 'user', content: 'How are you?' },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'user', content: 'Hello' },
      { type: 'message', role: 'assistant', content: 'Hi there!' },
      { type: 'message', role: 'user', content: 'How are you?' },
    ])
  })

  describe('image handling', () => {
    it('converts user message with URL image to content array', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What is in this image?' },
            {
              type: 'image',
              image: 'https://example.com/photo.png',
            },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'What is in this image?' },
            { type: 'input_image', image_url: 'https://example.com/photo.png' },
          ],
        },
      ])
    })

    it('converts base64 image to data: URI', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Describe this' },
            {
              type: 'image',
              image: 'iVBORw0KGgoAAAANSUhEUg',
              mediaType: 'image/png',
            },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Describe this' },
            { type: 'input_image', image_url: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg' },
          ],
        },
      ])
    })

    it('uses default media type for base64 when not specified', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: 'base64data',
            },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/png;base64,base64data' },
          ],
        },
      ])
    })

    it('passes through data: URIs as-is', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: 'data:image/jpeg;base64,/9j/4AAQ',
              mediaType: 'image/jpeg',
            },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'data:image/jpeg;base64,/9j/4AAQ' },
          ],
        },
      ])
    })

    it('handles http:// image URLs', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: 'http://example.com/image.jpg',
            },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_image', image_url: 'http://example.com/image.jpg' },
          ],
        },
      ])
    })

    it('handles multiple images with text', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Compare these images' },
            { type: 'image', image: 'https://example.com/a.png' },
            { type: 'image', image: 'https://example.com/b.png' },
          ],
        },
      ])
      expect(result).toEqual([
        {
          type: 'message',
          role: 'user',
          content: [
            { type: 'input_text', text: 'Compare these images' },
            { type: 'input_image', image_url: 'https://example.com/a.png' },
            { type: 'input_image', image_url: 'https://example.com/b.png' },
          ],
        },
      ])
    })

    it('skips images with missing image field', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image' },
          ],
        },
      ])
      expect(result).toEqual([
        { type: 'message', role: 'user', content: 'Hello' },
      ])
    })

    it('skips images with empty string image field', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Hello' },
            { type: 'image', image: '' },
          ],
        },
      ])
      expect(result).toEqual([
        { type: 'message', role: 'user', content: 'Hello' },
      ])
    })

    it('uses plain string content when no valid images are present', () => {
      const result = convertToResponsesApiInput([
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Just text' },
            { type: 'image' },
          ],
        },
      ])
      expect(result).toEqual([
        { type: 'message', role: 'user', content: 'Just text' },
      ])
    })
  })

  it('handles a full tool-use round trip', () => {
    const result = convertToResponsesApiInput([
      { role: 'user', content: 'Read the file' },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'call-abc',
            toolName: 'read_file',
            input: { path: 'index.ts' },
          },
        ],
      },
      {
        role: 'tool',
        toolCallId: 'call-abc',
        content: 'console.log("hello")',
      },
      { role: 'assistant', content: 'The file contains a log statement.' },
    ])
    expect(result).toEqual([
      { type: 'message', role: 'user', content: 'Read the file' },
      {
        type: 'function_call',
        id: 'call-abc',
        name: 'read_file',
        arguments: '{"path":"index.ts"}',
      },
      {
        type: 'function_call_output',
        call_id: 'call-abc',
        output: 'console.log("hello")',
      },
      {
        type: 'message',
        role: 'assistant',
        content: 'The file contains a log statement.',
      },
    ])
  })
})

describe('countTokensViaOpenAI', () => {
  const mockLogger = {
    info: () => {},
    error: () => {},
    warn: () => {},
    debug: () => {},
  } as any

  function createMockFetch(inputTokens: number) {
    return (async () =>
      new Response(JSON.stringify({ object: 'response.input_tokens', input_tokens: inputTokens }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })) as unknown as typeof globalThis.fetch
  }

  it('returns token count from OpenAI API', async () => {
    const result = await countTokensViaOpenAI({
      messages: [{ role: 'user', content: 'Hello world' }],
      system: undefined,
      model: 'openai/gpt-5.3-codex',
      fetch: createMockFetch(42),
      logger: mockLogger,
    })
    expect(result).toBe(42)
  })

  it('passes system prompt as instructions', async () => {
    let capturedBody: any
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(
        JSON.stringify({ object: 'response.input_tokens', input_tokens: 10 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await countTokensViaOpenAI({
      messages: [{ role: 'user', content: 'Hi' }],
      system: 'You are a helpful assistant.',
      model: 'openai/gpt-5.3',
      fetch: mockFetch as any,
      logger: mockLogger,
    })

    expect(capturedBody.instructions).toBe('You are a helpful assistant.')
    expect(capturedBody.model).toBe('gpt-5.3')
  })

  it('strips openai/ prefix from model', async () => {
    let capturedBody: any
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(
        JSON.stringify({ object: 'response.input_tokens', input_tokens: 5 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await countTokensViaOpenAI({
      messages: [{ role: 'user', content: 'Test' }],
      system: undefined,
      model: 'openai/gpt-5.3-codex',
      fetch: mockFetch as any,
      logger: mockLogger,
    })

    expect(capturedBody.model).toBe('gpt-5.3-codex')
  })

  it('omits instructions when system is undefined', async () => {
    let capturedBody: any
    const mockFetch = async (_url: string, init: RequestInit) => {
      capturedBody = JSON.parse(init.body as string)
      return new Response(
        JSON.stringify({ object: 'response.input_tokens', input_tokens: 5 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await countTokensViaOpenAI({
      messages: [{ role: 'user', content: 'Test' }],
      system: undefined,
      model: 'openai/gpt-5.3',
      fetch: mockFetch as any,
      logger: mockLogger,
    })

    expect(capturedBody.instructions).toBeUndefined()
  })

  it('throws on API error', async () => {
    const mockFetch = async () =>
      new Response('Internal Server Error', { status: 500 })

    await expect(
      countTokensViaOpenAI({
        messages: [{ role: 'user', content: 'Test' }],
        system: undefined,
        model: 'openai/gpt-5.3-codex',
        fetch: mockFetch as any,
        logger: mockLogger,
      }),
    ).rejects.toThrow('OpenAI API error: 500')
  })
})

describe('formatToolContent', () => {
  it('returns string content as-is', () => {
    expect(formatToolContent('simple string')).toBe('simple string')
  })

  it('formats array content with text parts', () => {
    const content = [
      { type: 'text', text: 'Line 1' },
      { type: 'text', text: 'Line 2' },
    ]
    expect(formatToolContent(content)).toBe('Line 1\nLine 2')
  })

  it('formats array content with json parts', () => {
    const content = [{ type: 'json', value: { key: 'value' } }]
    expect(formatToolContent(content)).toBe('{"key":"value"}')
  })

  it('formats object content as JSON', () => {
    const content = { key: 'value' }
    expect(formatToolContent(content)).toBe('{"key":"value"}')
  })
})
