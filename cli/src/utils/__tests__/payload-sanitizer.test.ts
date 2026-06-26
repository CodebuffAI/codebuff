import { describe, expect, test } from 'bun:test'

import {
  sanitizeForChatPersistence,
  sanitizeForDebugLog,
} from '../payload-sanitizer'

describe('payload-sanitizer', () => {
  test('redacts media tool results into json placeholders for persisted chat state', () => {
    const payload = [
      {
        type: 'json',
        value: { images: [{ path: 'current.png', status: 'attached' }] },
      },
      {
        type: 'media',
        data: 'a'.repeat(120_000),
        mediaType: 'image/png',
      },
    ]

    const sanitized = sanitizeForChatPersistence(payload) as any[]

    expect(sanitized[0].value.images[0].path).toBe('current.png')
    expect(sanitized[1].type).toBe('json')
    expect(sanitized[1].value.mediaRedacted).toBe(true)
    expect(sanitized[1].value.dataLength).toBe(120_000)
    expect(JSON.stringify(sanitized)).not.toContain('a'.repeat(1_000))
  })

  test('turns persisted model file and image parts into text placeholders', () => {
    const payload = {
      messageHistory: [
        {
          role: 'user',
          content: [
            {
              type: 'file',
              data: 'b'.repeat(90_000),
              mediaType: 'image/png',
            },
            {
              type: 'image',
              image: 'c'.repeat(90_000),
              mediaType: 'image/jpeg',
            },
          ],
        },
      ],
    }

    const sanitized = sanitizeForChatPersistence(payload) as any
    const content = sanitized.messageHistory[0].content

    expect(content[0].type).toBe('text')
    expect(content[0].text).toContain('omitted persisted file image/png payload')
    expect(content[1].type).toBe('text')
    expect(content[1].text).toContain('omitted persisted image image/jpeg payload')
    expect(JSON.stringify(sanitized)).not.toContain('b'.repeat(1_000))
    expect(JSON.stringify(sanitized)).not.toContain('c'.repeat(1_000))
  })

  test('keeps UI image block metadata while dropping base64 image data', () => {
    const payload = {
      type: 'image',
      image: 'd'.repeat(90_000),
      mediaType: 'image/png',
      filename: 'current.png',
      size: 1234,
      width: 640,
      height: 480,
    }

    const sanitized = sanitizeForChatPersistence(payload) as any

    expect(sanitized.type).toBe('image')
    expect(sanitized.image).toBe('')
    expect(sanitized.imageRedacted).toBe(true)
    expect(sanitized.imageLength).toBe(90_000)
    expect(sanitized.filename).toBe('current.png')
  })

  test('truncates very large persisted strings', () => {
    const payload = {
      blocks: [
        {
          type: 'tool',
          toolName: 'read_files',
          output: 'x'.repeat(90_000),
        },
      ],
    }

    const sanitized = sanitizeForChatPersistence(payload) as any
    const output = sanitized.blocks[0].output

    expect(output.length).toBeLessThan(10_000)
    expect(output).toContain('Openbuff truncated')
  })

  test('debug log sanitizer caps arrays, strings, and circular references', () => {
    const payload: any = {
      values: Array.from({ length: 130 }, (_, index) => index),
      output: 'z'.repeat(20_000),
    }
    payload.self = payload

    const sanitized = sanitizeForDebugLog(payload) as any

    expect(sanitized.values).toHaveLength(121)
    expect(sanitized.values[120]).toContain('omitted 10 array items')
    expect(sanitized.output.length).toBeLessThan(9_000)
    expect(sanitized.self).toBe('[Circular]')
  })
})

describe('payload-sanitizer token redaction', () => {
  test('redacts OAuth token fields across casing variants in debug logs', () => {
    const secret = 'sk-very-long-secret-oauth-token-value-1234567890'
    const payload = {
      chatgptOAuth: {
        accessToken: secret,
        refresh_token: secret,
        id_token: secret,
      },
      headers: { Authorization: `Bearer ${secret}` },
      apiKey: secret,
      api_key: secret,
      APIKEY: secret,
      normal: 'kept',
    }

    const sanitized = sanitizeForDebugLog(payload) as any

    expect(sanitized.chatgptOAuth.accessToken).toBe('[REDACTED]')
    expect(sanitized.chatgptOAuth.refresh_token).toBe('[REDACTED]')
    expect(sanitized.chatgptOAuth.id_token).toBe('[REDACTED]')
    expect(sanitized.headers.Authorization).toBe('[REDACTED]')
    expect(sanitized.apiKey).toBe('[REDACTED]')
    expect(sanitized.api_key).toBe('[REDACTED]')
    expect(sanitized.APIKEY).toBe('[REDACTED]')
    expect(sanitized.normal).toBe('kept')
    expect(JSON.stringify(sanitized)).not.toContain(secret)
  })

  test('redacts token values in persisted chat state too', () => {
    const secret = 'sk-secret-access-token-xyz'
    const payload = {
      credentials: { accessToken: secret, refreshToken: secret },
      meta: { token: secret },
    }

    const sanitized = sanitizeForChatPersistence(payload) as any

    expect(sanitized.credentials.accessToken).toBe('[REDACTED]')
    expect(sanitized.credentials.refreshToken).toBe('[REDACTED]')
    expect(sanitized.meta.token).toBe('[REDACTED]')
    expect(JSON.stringify(sanitized)).not.toContain(secret)
  })

  test('preserves object shape under sensitive keys; nested non-sensitive string keys are kept', () => {
    const secret = 'sk-nested-secret-token'
    const payload = {
      token: { value: secret, type: 'bearer', safe: 'keep' },
    }

    const sanitized = sanitizeForDebugLog(payload) as any

    // The outer key 'token' is sensitive, but its value is an object. We
    // recurse to preserve the shape. Inner keys are NOT redacted by the
    // outer key name — redaction is keyed on field name, not value content —
    // so 'value' (a non-sensitive key) keeps its string. This documents the
    // contract: nest credentials under a sensitive key name to protect them,
    // or use a sensitive key name directly.
    expect(typeof sanitized.token).toBe('object')
    expect(sanitized.token.value).toBe(secret)
    expect(sanitized.token.type).toBe('bearer')
    expect(sanitized.token.safe).toBe('keep')
  })

  test('redacts nested strings when the nested key is itself sensitive', () => {
    const secret = 'sk-nested-secret-token'
    const payload = {
      config: { access_token: secret, description: 'keep this text' },
    }

    const sanitized = sanitizeForDebugLog(payload) as any

    expect(sanitized.config.access_token).toBe('[REDACTED]')
    expect(sanitized.config.description).toBe('keep this text')
    expect(JSON.stringify(sanitized)).not.toContain(secret)
  })

  test('redacts URL values under sensitive keys', () => {
    const secret = 'abcdef-secret-token-in-url'
    const payload = {
      tokenUrl: new URL(`https://example.com/auth?access_token=${secret}`),
      normalUrl: new URL('https://example.com/safe'),
    }

    const sanitized = sanitizeForDebugLog(payload) as any

    expect(sanitized.tokenUrl).toBe('[REDACTED]')
    expect(sanitized.normalUrl).toBe('https://example.com/safe')
    expect(JSON.stringify(sanitized)).not.toContain(secret)
  })
})
