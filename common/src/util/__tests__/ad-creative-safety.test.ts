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

  test('normalizes carriage returns and strips bidi/invisible characters', () => {
    expect(sanitizeAdText('legit\rEVIL')).toBe('legit\nEVIL')
    expect(sanitizeAdText('safe‮evil')).toBe('safeevil')
    expect(sanitizeAdText('goo​gle')).toBe('google')
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
