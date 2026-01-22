import { describe, expect, it } from 'bun:test'

import { parseActionValue } from '../browser-actions'

describe('parseActionValue', () => {
  it('should parse boolean strings', () => {
    expect(parseActionValue('true')).toBe(true)
    expect(parseActionValue('false')).toBe(false)
  })

  it('should parse numeric strings', () => {
    expect(parseActionValue('42')).toBe(42)
    expect(parseActionValue('3.14')).toBe(3.14)
    expect(parseActionValue('0')).toBe(0)
    expect(parseActionValue('-10')).toBe(-10)
    expect(parseActionValue('-3.14')).toBe(-3.14)
  })

  it('should parse JSON objects', () => {
    expect(parseActionValue('{"key":"value"}')).toEqual({ key: 'value' })
    expect(parseActionValue('{"timeout":5000}')).toEqual({ timeout: 5000 })
  })

  it('should parse JSON arrays', () => {
    expect(parseActionValue('[1,2,3]')).toEqual([1, 2, 3])
    expect(parseActionValue('["a","b"]')).toEqual(['a', 'b'])
  })

  it('should return invalid JSON as string', () => {
    expect(parseActionValue('{invalid}')).toBe('{invalid}')
    expect(parseActionValue('[incomplete')).toBe('[incomplete')
  })

  it('should keep regular strings as strings', () => {
    expect(parseActionValue('hello')).toBe('hello')
    expect(parseActionValue('https://example.com')).toBe('https://example.com')
    expect(parseActionValue('')).toBe('')
  })

  it('should not parse strings that look like numbers but are not', () => {
    // Mixed alphanumeric strings should remain as strings
    expect(parseActionValue('123abc')).toBe('123abc')
  })

  it('should keep empty string as empty string', () => {
    expect(parseActionValue('')).toBe('')
  })

  // Edge case tests for strict numeric parsing
  describe('numeric parsing edge cases', () => {
    it('should keep whitespace-only strings as strings', () => {
      expect(parseActionValue('   ')).toBe('   ')
      expect(parseActionValue(' ')).toBe(' ')
      expect(parseActionValue('\t')).toBe('\t')
      expect(parseActionValue('\n')).toBe('\n')
    })

    it('should keep hex strings as strings', () => {
      expect(parseActionValue('0x10')).toBe('0x10')
      expect(parseActionValue('0xFF')).toBe('0xFF')
      expect(parseActionValue('0xABC')).toBe('0xABC')
    })

    it('should keep binary strings as strings', () => {
      expect(parseActionValue('0b10')).toBe('0b10')
      expect(parseActionValue('0b1111')).toBe('0b1111')
    })

    it('should keep octal strings as strings', () => {
      expect(parseActionValue('0o10')).toBe('0o10')
      expect(parseActionValue('0o777')).toBe('0o777')
    })

    it('should keep Infinity as string', () => {
      expect(parseActionValue('Infinity')).toBe('Infinity')
      expect(parseActionValue('-Infinity')).toBe('-Infinity')
    })

    it('should keep NaN as string', () => {
      expect(parseActionValue('NaN')).toBe('NaN')
    })

    it('should keep scientific notation as string', () => {
      expect(parseActionValue('1e10')).toBe('1e10')
      expect(parseActionValue('1E10')).toBe('1E10')
      expect(parseActionValue('1e+10')).toBe('1e+10')
      expect(parseActionValue('1e-10')).toBe('1e-10')
      expect(parseActionValue('2.5e3')).toBe('2.5e3')
    })

    it('should keep explicit positive sign as string', () => {
      expect(parseActionValue('+5')).toBe('+5')
      expect(parseActionValue('+3.14')).toBe('+3.14')
    })

    it('should parse numbers with leading zeros as numbers', () => {
      // Leading zeros are allowed and parsed as decimal numbers
      expect(parseActionValue('007')).toBe(7)
      expect(parseActionValue('00')).toBe(0)
      expect(parseActionValue('0123')).toBe(123)
    })

    it('should keep strings with embedded whitespace as strings', () => {
      expect(parseActionValue('  42  ')).toBe('  42  ')
      expect(parseActionValue('4 2')).toBe('4 2')
    })
  })

  // Edge case tests for JSON parsing
  describe('JSON parsing edge cases', () => {
    it('should parse nested JSON objects', () => {
      expect(parseActionValue('{"a":{"b":{"c":1}}}')).toEqual({
        a: { b: { c: 1 } },
      })
    })

    it('should parse nested JSON arrays', () => {
      expect(parseActionValue('[[1,2],[3,4]]')).toEqual([
        [1, 2],
        [3, 4],
      ])
    })

    it('should parse JSON with mixed types', () => {
      expect(parseActionValue('[1,"a",true,null]')).toEqual([1, 'a', true, null])
    })

    it('should parse JSON with special characters', () => {
      expect(parseActionValue('{"key":"value with spaces"}')).toEqual({
        key: 'value with spaces',
      })
      expect(parseActionValue('{"key":"line1\\nline2"}')).toEqual({
        key: 'line1\nline2',
      })
    })

    it('should parse empty JSON structures', () => {
      expect(parseActionValue('{}')).toEqual({})
      expect(parseActionValue('[]')).toEqual([])
    })
  })
})
