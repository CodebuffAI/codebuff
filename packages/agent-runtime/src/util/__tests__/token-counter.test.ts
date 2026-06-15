import { describe, expect, test } from 'bun:test'

import { countTokensJson } from '../token-counter'

describe('countTokensJson', () => {
  test('does not count base64 media payloads as text tokens', () => {
    const withMediaPayload = [
      {
        role: 'tool',
        toolName: 'read_image',
        toolCallId: 'tool-1',
        content: [
          {
            type: 'media',
            mediaType: 'image/png',
            data: 'a'.repeat(3_000_000),
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'file',
            mediaType: 'image/png',
            data: 'b'.repeat(3_000_000),
          },
          {
            type: 'image',
            mediaType: 'image/jpeg',
            image: 'c'.repeat(3_000_000),
          },
        ],
      },
    ]

    expect(countTokensJson(withMediaPayload)).toBeLessThan(1_000)
  })
})
