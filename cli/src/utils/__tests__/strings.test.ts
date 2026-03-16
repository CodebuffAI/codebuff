import { describe, expect, test } from 'bun:test'

import {
  truncateToLines,
  MAX_COLLAPSED_LINES,
  createTextPasteHandler,
  createPasteHandler,
  LONG_TEXT_THRESHOLD,
} from '../strings'

import type { InputValue } from '../../types/store'

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

describe('createTextPasteHandler - ANSI stripping', () => {
  test('strips ANSI escape sequences from pasted text', () => {
    let result: InputValue | null = null
    const handler = createTextPasteHandler('', 0, (value) => { result = value })

    handler('\x1b[31mred text\x1b[0m')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('red text')
    expect(result!.cursorPosition).toBe(8)
  })

  test('passes through plain text unchanged', () => {
    let result: InputValue | null = null
    const handler = createTextPasteHandler('', 0, (value) => { result = value })

    handler('plain text')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('plain text')
  })

  test('strips complex ANSI sequences (bold, 256-color)', () => {
    let result: InputValue | null = null
    const handler = createTextPasteHandler('', 0, (value) => { result = value })

    handler('\x1b[1m\x1b[38;5;196mbold colored\x1b[0m')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('bold colored')
  })

  test('does not insert when text is only ANSI codes (empty after stripping)', () => {
    let result: InputValue | null = null
    const handler = createTextPasteHandler('', 0, (value) => { result = value })

    handler('\x1b[31m\x1b[0m')

    expect(result).toBeNull()
  })

  test('inserts stripped text at cursor position in existing text', () => {
    let result: InputValue | null = null
    const handler = createTextPasteHandler('hello world', 5, (value) => { result = value })

    handler('\x1b[32m pasted\x1b[0m')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('hello pasted world')
    expect(result!.cursorPosition).toBe(12)
  })
})

describe('createPasteHandler - ANSI stripping', () => {
  test('strips ANSI from eventText for regular text paste', () => {
    let result: InputValue | null = null
    const handler = createPasteHandler({
      text: '',
      cursorPosition: 0,
      onChange: (value) => { result = value },
    })

    handler('\x1b[31mhello\x1b[0m')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('hello')
    expect(result!.cursorPosition).toBe(5)
  })

  test('strips ANSI from eventText before checking long text threshold', () => {
    let longTextResult: string | null = null
    const handler = createPasteHandler({
      text: '',
      cursorPosition: 0,
      onChange: () => {},
      onPasteLongText: (text) => { longTextResult = text },
    })

    // Create text that is over threshold BEFORE stripping but under AFTER
    const ansiOverhead = '\x1b[31m'.repeat(400) + '\x1b[0m'.repeat(400)
    const shortContent = 'a'.repeat(100)
    handler(ansiOverhead + shortContent)

    // Should NOT be treated as long text since stripped content is short
    expect(longTextResult).toBeNull()
  })

  test('strips ANSI but preserves plain text content', () => {
    let result: InputValue | null = null
    const handler = createPasteHandler({
      text: 'existing ',
      cursorPosition: 9,
      onChange: (value) => { result = value },
    })

    handler('\x1b[1m\x1b[34mblue bold text\x1b[0m')

    expect(result).not.toBeNull()
    expect(result!.text).toBe('existing blue bold text')
    expect(result!.cursorPosition).toBe(23)
  })

  test('long text handler receives stripped text', () => {
    let longTextResult: string | null = null
    const handler = createPasteHandler({
      text: '',
      cursorPosition: 0,
      onChange: () => {},
      onPasteLongText: (text) => { longTextResult = text },
    })

    const longContent = 'x'.repeat(LONG_TEXT_THRESHOLD + 1)
    handler(`\x1b[31m${longContent}\x1b[0m`)

    expect(longTextResult).not.toBeNull()
    expect(longTextResult!).toBe(longContent)
  })
})
