import { describe, expect, test } from 'bun:test'

import {
  createFileReadLimiter,
  MAX_READ_FILE_CHARS,
  MAX_READ_FILE_LINES,
  MAX_READ_FILES_CHARS,
  MAX_READ_FILES_TOKENS,
  windowFileRead,
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

describe('windowFileRead', () => {
  test('returns a small file unchanged, including its trailing newline', () => {
    const content = 'a\nb\nc\n'

    expect(windowFileRead(content)).toBe(content)
  })

  test('does not count the trailing newline as an extra line', () => {
    const content =
      Array.from({ length: MAX_READ_FILE_LINES }, (_, i) => `line ${i + 1}`).join('\n') + '\n'

    expect(windowFileRead(content)).toBe(content)
  })

  test('caps an unwindowed read at the line limit and reports the true total', () => {
    const totalLines = MAX_READ_FILE_LINES + 500
    const content = Array.from({ length: totalLines }, (_, i) => `line ${i + 1}`).join('\n')
    const result = windowFileRead(content)

    expect(result).toContain(`showing lines 1-${MAX_READ_FILE_LINES} of ${totalLines}`)
    expect(result).toContain(`offset=${MAX_READ_FILE_LINES + 1} to continue`)
    expect(result).not.toContain(`line ${MAX_READ_FILE_LINES + 1}\n`)
  })

  test('returns the requested window with a footer', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    const result = windowFileRead(content, 10, 5)

    expect(result).toContain('line 10')
    expect(result).toContain('line 14')
    expect(result).not.toContain('line 15\n')
    expect(result).toContain('showing lines 10-14 of 100')
    expect(result).toContain('offset=15 to continue')
  })

  test('omits the continue advice when the window reaches the end of the file', () => {
    const content = Array.from({ length: 100 }, (_, i) => `line ${i + 1}`).join('\n')
    const result = windowFileRead(content, 90, 20)

    expect(result).toContain('showing lines 90-100 of 100')
    expect(result).not.toContain('to continue')
  })

  test('reports an offset beyond the end of the file', () => {
    const content = 'a\nb\nc'

    expect(windowFileRead(content, 10)).toBe(
      '[read_files: 3 lines total; offset 10 is beyond the end of the file.]',
    )
  })

  test('clamps a requested limit to the line cap', () => {
    const totalLines = MAX_READ_FILE_LINES + 500
    const content = Array.from({ length: totalLines }, (_, i) => `line ${i + 1}`).join('\n')
    const result = windowFileRead(content, 1, totalLines)

    expect(result).toContain(`showing lines 1-${MAX_READ_FILE_LINES} of ${totalLines}`)
  })

  test('shortens a window that exceeds the char cap and says so', () => {
    const line = 'x'.repeat(1000)
    const totalLines = 100
    const content = Array.from({ length: totalLines }, () => line).join('\n')
    const result = windowFileRead(content, 1, totalLines)

    const match = result.match(/showing lines 1-(\d+) of 100/)
    expect(match).not.toBeNull()
    expect(Number(match![1])).toBeLessThan(totalLines)
    expect(result).toContain(
      `shortened to stay under ${MAX_READ_FILE_CHARS.toLocaleString()} characters`,
    )
    expect(result).toContain('to continue')
  })
})
