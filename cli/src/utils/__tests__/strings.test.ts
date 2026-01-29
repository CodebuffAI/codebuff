import { describe, expect, test } from 'bun:test'

import { truncateToLines, MAX_COLLAPSED_LINES } from '../strings'

describe('MAX_COLLAPSED_LINES', () => {
  test('is set to 3', () => {
    expect(MAX_COLLAPSED_LINES).toBe(3)
  })
})

describe('truncateToLines', () => {
  test('returns empty string unchanged', () => {
    expect(truncateToLines('', 3)).toBe('')
  })

  test('returns falsy values unchanged', () => {
    expect(truncateToLines(null, 3)).toBe(null)
    expect(truncateToLines(undefined, 3)).toBe(undefined)
  })

  test('returns single line unchanged', () => {
    expect(truncateToLines('single line', 3)).toBe('single line')
  })

  test('returns text with fewer lines than max unchanged', () => {
    const text = 'line 1\nline 2'
    expect(truncateToLines(text, 3)).toBe('line 1\nline 2')
  })

  test('returns text with exact max lines unchanged', () => {
    const text = 'line 1\nline 2\nline 3'
    expect(truncateToLines(text, 3)).toBe('line 1\nline 2\nline 3')
  })

  test('truncates text exceeding max lines and adds ellipsis', () => {
    const text = 'line 1\nline 2\nline 3\nline 4'
    expect(truncateToLines(text, 3)).toBe('line 1\nline 2\nline 3...')
  })

  test('truncates text with many lines', () => {
    const text = 'line 1\nline 2\nline 3\nline 4\nline 5\nline 6'
    expect(truncateToLines(text, 3)).toBe('line 1\nline 2\nline 3...')
  })

  test('handles maxLines of 1', () => {
    const text = 'line 1\nline 2\nline 3'
    expect(truncateToLines(text, 1)).toBe('line 1...')
  })

  test('trims trailing whitespace before adding ellipsis', () => {
    const text = 'line 1\nline 2  \nline 3\nline 4'
    expect(truncateToLines(text, 2)).toBe('line 1\nline 2...')
  })

  test('handles text with empty lines', () => {
    const text = 'line 1\n\nline 3\nline 4'
    expect(truncateToLines(text, 3)).toBe('line 1\n\nline 3...')
  })

  test('handles text ending with newline', () => {
    const text = 'line 1\nline 2\nline 3\n'
    // 4 lines when split (last is empty), but only 3 visible lines of content
    expect(truncateToLines(text, 3)).toBe('line 1\nline 2\nline 3...')
  })
})
