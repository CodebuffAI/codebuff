import { describe, expect, test } from 'bun:test'

import {
  isAdTextSafe,
  sanitizeAdText,
  sanitizeAdUrl,
} from '../ad-creative-safety'

describe('sanitizeAdText', () => {
  test('strips colour, cursor, reset, and clipboard sequences', () => {
    expect(sanitizeAdText('\x1b[31mred\x1b[0m')).toBe('red')
    expect(sanitizeAdText('a\x1b[2Jb')).toBe('ab')
    expect(sanitizeAdText('a\x1bcb')).toBe('ab')
    expect(sanitizeAdText('buy\x1b]52;c;ZXZpbA==\x07 now')).toBe('buy now')
  })

  test('strips BEL- and ST-terminated C1 terminal commands whole', () => {
    expect(sanitizeAdText('buy\x9d52;c;ZXZpbA==\x07 now')).toBe('buy now')
    expect(sanitizeAdText('buy\x1b]52;c;ZXZpbA==\x1b\\ now')).toBe('buy now')
    expect(sanitizeAdText('buy\x90payload\x9c now')).toBe('buy now')
    expect(sanitizeAdText('buy\x9b31mred\x9b0m now')).toBe('buyred now')
  })

  test('normalizes carriage returns, tabs, and strips C0/C1 controls', () => {
    expect(sanitizeAdText('legit\rEVIL')).toBe('legit\nEVIL')
    expect(sanitizeAdText('a\tb')).toBe('a  b')
    expect(sanitizeAdText('a\x07b\x08c\x1fd')).toBe('abcd')
    expect(sanitizeAdText('a\x80b\x85c\x8dd')).toBe('abcd')
  })

  test('deletes bidi and the complete Unicode default-ignorable set', () => {
    const defaultIgnorables = [
      '\u00ad', // soft hyphen
      '\u034f', // combining grapheme joiner
      '\u061c', // Arabic letter mark
      '\u115f', // Hangul choseong filler
      '\u17b4', // Khmer inherent vowel AQ
      '\u180e', // Mongolian vowel separator
      '\u200b', // zero-width space
      '\u202e', // right-to-left override
      '\u2060', // word joiner
      '\u206f', // nominal digit shapes
      '\u3164', // Hangul filler
      '\ufe0f', // variation selector-16
      '\ufeff', // BOM / zero-width no-break space
      '\uffa0', // halfwidth Hangul filler
      '\ufff0', // reserved default-ignorable
      '\ufffb', // interlinear annotation terminator
      '\u{1bca0}', // shorthand format letter overlap
      '\u{1d173}', // musical symbol begin beam
      '\u{e0041}', // Unicode tag A
      '\u{e0080}', // reserved tag-plane default-ignorable
      '\u{e0100}', // variation selector supplement
      '\u{e0fff}', // reserved tag-plane default-ignorable
    ]

    for (const character of defaultIgnorables) {
      expect(sanitizeAdText(`de${character}lete`)).toBe('delete')
    }
  })

  test('normalizes tabs, trims, and is idempotent', () => {
    const dirty = '  a\tb\n\x1b[1mc  '
    expect(sanitizeAdText(dirty)).toBe('a  b\nc')
    expect(sanitizeAdText(sanitizeAdText(dirty))).toBe(sanitizeAdText(dirty))
    expect(isAdTextSafe('plain text')).toBe(true)
    expect(isAdTextSafe('\x1b[31mred')).toBe(false)
  })
})

describe('sanitizeAdUrl', () => {
  test('accepts an absolute https destination', () => {
    expect(sanitizeAdUrl('https://example.com/a?b=1')).toBe(
      'https://example.com/a?b=1',
    )
  })

  test('rejects unsafe, relative, and escape-smuggled schemes', () => {
    expect(() => sanitizeAdUrl('javascript:alert(1)')).toThrow(/not allowed/)
    expect(() => sanitizeAdUrl('/relative')).toThrow(/absolute URL/)
    expect(() => sanitizeAdUrl('\x1b[0mjavascript:alert(1)')).toThrow(
      /not allowed/,
    )
  })
})
