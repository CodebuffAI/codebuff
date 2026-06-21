import { describe, expect, it } from 'bun:test'

import { summarizeMessagesForLog } from '../log-summary'

// 78-byte PNG → ~104 base64 chars → ~78 estimated bytes.
const TINY_PNG_B64 = 'A'.repeat(104)

describe('summarizeMessagesForLog', () => {
  it('summarizes roles, text size, and image bytes/types without leaking content', () => {
    const summary = summarizeMessagesForLog([
      { role: 'system', content: 'you are helpful' },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'what is this?' },
          {
            type: 'image_url',
            image_url: { url: `data:image/png;base64,${TINY_PNG_B64}` },
          },
        ],
      },
    ])

    expect(summary.messageCount).toBe(2)
    expect(summary.roles).toEqual({ system: 1, user: 1 })
    expect(summary.imageCount).toBe(1)
    expect(summary.imageMediaTypes).toEqual(['image/png'])
    // ~78 bytes — small enough to flag a degenerate image at a glance.
    expect(summary.imageBytes[0]).toBe(78)
    expect(summary.textChars).toBe('you are helpful'.length + 'what is this?'.length)

    // The redaction guarantee: no base64 / message text anywhere in the output.
    const serialized = JSON.stringify(summary)
    expect(serialized).not.toContain(TINY_PNG_B64)
    expect(serialized).not.toContain('what is this?')
  })

  it('accepts the string image_url shape and counts remote (non-data) URLs', () => {
    const summary = summarizeMessagesForLog([
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: `data:image/jpeg;base64,${'B'.repeat(8)}` },
          { type: 'image_url', image_url: { url: 'https://example.com/cat.png' } },
        ],
      },
    ])
    expect(summary.imageCount).toBe(2)
    expect(summary.remoteImageCount).toBe(1)
    expect(summary.imageMediaTypes).toEqual(['image/jpeg'])
    expect(summary.imageBytes).toEqual([6])
  })

  it('is a safe no-op on malformed input', () => {
    expect(summarizeMessagesForLog(undefined).messageCount).toBe(0)
    expect(summarizeMessagesForLog('not an array').imageCount).toBe(0)
    expect(summarizeMessagesForLog([null, 42, { role: 'user' }]).messageCount).toBe(3)
  })
})
