import { describe, expect, test } from 'bun:test'

import {
  createFileReadLimiter,
  MAX_READ_FILES_CHARS,
  MAX_READ_FILES_TOKENS,
} from '../file-read-limits'

describe('createFileReadLimiter', () => {
  test('returns a small file unchanged', () => {
    const limiter = createFileReadLimiter()

    expect(limiter.limit('small file')).toBe('small file')
  })

  test('caps a single file at the per-file limit', () => {
    const limiter = createFileReadLimiter()
    const content = 'a'.repeat(MAX_READ_FILES_CHARS + 1)
    const result = limiter.limit(content)

    expect(result).toStartWith('a'.repeat(MAX_READ_FILES_CHARS))
    expect(result).toContain('character hard limit')
    expect(result).not.toContain('a'.repeat(MAX_READ_FILES_CHARS + 1))
  })

  test('does not split a surrogate pair at the character limit', () => {
    const limiter = createFileReadLimiter()
    const prefix = 'a'.repeat(MAX_READ_FILES_CHARS - 1)
    const result = limiter.limit(`${prefix}😀tail`)

    expect(result).toStartWith(`${prefix}\n\n[FILE_TOO_LARGE]`)
    expect(result).not.toContain('\ud83d')
  })

  test('shares one aggregate budget across files in request order', () => {
    const limiter = createFileReadLimiter()
    const first = limiter.limit('a'.repeat(60_000))
    const second = limiter.limit('b'.repeat(60_000))
    const third = limiter.limit('UNIQUE_THIRD_FILE_CONTENT')

    expect(first).toBe('a'.repeat(60_000))
    expect(second).toStartWith('b'.repeat(40_000))
    expect(second).not.toContain('b'.repeat(40_001))
    expect(second).toContain('combined read_files output')
    expect(third).not.toContain('UNIQUE_THIRD_FILE_CONTENT')
    expect(third).toContain('truncated after 0 characters')
    expect(60_000 + 40_000).toBe(MAX_READ_FILES_CHARS)
  })

  test('caps a token-dense file using an injected estimator', () => {
    const limiter = createFileReadLimiter({
      countTokens: (text) => text.length,
    })
    const result = limiter.limit('t'.repeat(25_000))
    const includedContent = result.split('\n\n[FILE_TOO_LARGE]')[0]

    expect(includedContent).toBe('t'.repeat(19 * 1_024))
    expect(includedContent.length).toBeLessThanOrEqual(MAX_READ_FILES_TOKENS)
    expect(result).toContain('estimated-token per-file limit')
  })

  test('does not split a surrogate pair at the token limit', () => {
    const limiter = createFileReadLimiter({
      countTokens: (text) => Array.from(text).length,
    })
    const result = limiter.limit('😀'.repeat(25_000))
    const includedContent = result.split('\n\n[FILE_TOO_LARGE]')[0]
    const lastCodeUnit = includedContent.charCodeAt(includedContent.length - 1)

    expect(Array.from(includedContent).length).toBeLessThanOrEqual(
      MAX_READ_FILES_TOKENS,
    )
    expect(lastCodeUnit < 0xd800 || lastCodeUnit > 0xdbff).toBe(true)
  })

  test('shares one token budget across files in request order', () => {
    const limiter = createFileReadLimiter({
      countTokens: (text) => text.length,
    })
    const first = limiter.limit('a'.repeat(12_000))
    const second = limiter.limit('b'.repeat(12_000))
    const thirdContent = 'UNIQUE_THIRD_FILE_CONTENT'
    const third = limiter.limit(thirdContent)
    const secondContent = second.split('\n\n[FILE_TOO_LARGE]')[0]

    expect(first).toBe('a'.repeat(12_000))
    expect(secondContent).toBe('b'.repeat(7 * 1_024))
    expect(second).toContain('combined read_files output')
    expect(second).toContain('estimated-token limit')
    expect(third).toBe(thirdContent)
    expect(first.length + secondContent.length + third.length).toBeLessThan(
      MAX_READ_FILES_TOKENS,
    )
  })
})
