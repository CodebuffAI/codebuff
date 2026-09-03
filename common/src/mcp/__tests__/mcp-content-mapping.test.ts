import { describe, test, expect } from 'bun:test'

import { mcpContentToToolResultOutputs } from '../client'

describe('mcpContentToToolResultOutputs: resources (the bug: prose as base64 media)', () => {
  test('a text resource becomes a text value, NOT media', () => {
    const outputs = mcpContentToToolResultOutputs([
      {
        type: 'resource',
        resource: {
          uri: 'file:///notes.txt',
          mimeType: 'text/plain',
          text: 'Resource 1: This is a plain text resource.',
        },
      },
    ] as never)

    // The bug: this prose was wrapped as media, and on every later turn the
    // AI SDK base64-decodes file data - "The string contains invalid
    // characters", forever, since the message replays from history.
    expect(outputs).toEqual([
      {
        type: 'json',
        value: 'Resource 1: This is a plain text resource.',
      },
    ])
  })

  test('an image resource stays media', () => {
    const outputs = mcpContentToToolResultOutputs([
      {
        type: 'resource',
        resource: {
          uri: 'file:///logo.png',
          mimeType: 'image/png',
          blob: 'aGVsbG8=',
        },
      },
    ] as never)

    expect(outputs).toHaveLength(1)
    expect(outputs[0].type).toBe('media')
    expect((outputs[0] as { mediaType?: string }).mediaType).toBe('image/png')
  })

  test('plain text content still maps to a json value', () => {
    const outputs = mcpContentToToolResultOutputs([
      { type: 'text', text: 'Echo: hello' },
    ] as never)
    expect(outputs).toEqual([{ type: 'json', value: 'Echo: hello' }])
  })
})
