import { describe, expect, it } from 'bun:test'

import {
  convertContentToAnthropic,
  convertToAnthropicMessages,
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
    const content = [
      { type: 'json', value: { key: 'value' } },
    ]
    expect(formatToolContent(content)).toBe('{"key":"value"}')
  })

  it('formats object content as JSON', () => {
    const content = { key: 'value' }
    expect(formatToolContent(content)).toBe('{"key":"value"}')
  })
})
