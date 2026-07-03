import { describe, expect, it } from 'bun:test'

import { dropEmptyImageParts } from '../sanitize-images'

import type { ChatMessage } from '../types'

const REAL_IMAGE = `data:image/png;base64,${'A'.repeat(104)}`

describe('dropEmptyImageParts', () => {
  it('replaces a zero-byte data-URL image with a text notice and reports it', () => {
    const messages: ChatMessage[] = [
      { role: 'system', content: 'you are helpful' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          // The prod failure shape: media type present, payload empty.
          { type: 'image_url', image_url: { url: 'data:image/png;base64,' } },
        ],
      },
    ]

    const { messages: sanitized, dropped } = dropEmptyImageParts(messages)

    expect(dropped).toEqual([
      {
        messageIndex: 1,
        role: 'user',
        mediaType: 'image/png',
        reason: 'empty-data',
      },
    ])
    const content = sanitized[1].content as Array<{ type: string; text?: string }>
    expect(content).toHaveLength(2)
    expect(content.every((p) => p.type === 'text')).toBe(true)
    expect(content[1].text).toContain('omitted')
    // Untouched messages are passed through as-is.
    expect(sanitized[0]).toBe(messages[0])
  })

  it('drops images with missing or blank URLs (both image_url shapes)', () => {
    const { messages: sanitized, dropped } = dropEmptyImageParts([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: '' },
          { type: 'image_url' },
          { type: 'image_url', image_url: { url: 'data:;base64,' } },
        ],
      },
    ])

    expect(dropped.map((d) => d.reason)).toEqual([
      'empty-url',
      'empty-url',
      'empty-data',
    ])
    const content = sanitized[0].content as Array<{ type: string }>
    expect(content.every((p) => p.type === 'text')).toBe(true)
  })

  it('keeps valid data-URL and remote images intact', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: REAL_IMAGE } },
          { type: 'image_url', image_url: 'https://example.com/cat.png' },
        ],
      },
    ]

    const { messages: sanitized, dropped } = dropEmptyImageParts(messages)

    expect(dropped).toEqual([])
    // No drops → the exact same array comes back, so callers can cheaply
    // detect "nothing changed".
    expect(sanitized).toBe(messages)
  })

  it('is a safe no-op on string content and malformed input', () => {
    expect(
      dropEmptyImageParts([{ role: 'user', content: 'plain text' }]).dropped,
    ).toEqual([])
    expect(
      dropEmptyImageParts(undefined as unknown as ChatMessage[]).dropped,
    ).toEqual([])
    expect(
      dropEmptyImageParts([null as unknown as ChatMessage]).dropped,
    ).toEqual([])
  })
})
