import { describe, it, expect } from 'bun:test'

import { stripNullCharsFromObject } from '../object'

describe('stripNullCharsFromObject', () => {
  it('should remove null characters from strings in a simple object', () => {
    const input = {
      a: 'hello\u0000world',
      b: 'test\u0000ing',
      c: 123,
    }
    const expected = {
      a: 'helloworld',
      b: 'testing',
      c: 123,
    }
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should remove null characters from strings in a nested object', () => {
    const input = {
      level1: {
        a: 'nested\u0000string',
        b: true,
        level2: {
          c: 'deep\u0000er',
          d: null,
        },
      },
      e: 'top\u0000level',
    }
    const expected = {
      level1: {
        a: 'nestedstring',
        b: true,
        level2: {
          c: 'deeper',
          d: null,
        },
      },
      e: 'toplevel',
    }
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should remove null characters from strings within an array', () => {
    const input = ['one\u0000', 'two\u0000three', 4, 'five']
    const expected = ['one', 'twothree', 4, 'five']
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should remove null characters from strings within objects in an array', () => {
    const input = [
      { id: 1, text: 'item\u0000one' },
      { id: 2, text: 'item\u0000two', value: 10 },
      { id: 3, text: 'item three' },
    ]
    const expected = [
      { id: 1, text: 'itemone' },
      { id: 2, text: 'itemtwo', value: 10 },
      { id: 3, text: 'item three' },
    ]
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should handle mixed data types correctly', () => {
    const input = {
      str: 'a\u0000b',
      num: 123,
      bool: false,
      nil: null,
      undef: undefined,
      arr: [1, 'c\u0000d', true],
      obj: { nested: 'e\u0000f' },
    }
    const expected = {
      str: 'ab',
      num: 123,
      bool: false,
      nil: null,
      undef: undefined,
      arr: [1, 'cd', true],
      obj: { nested: 'ef' },
    }
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should handle empty objects and arrays', () => {
    expect(stripNullCharsFromObject({})).toEqual({})
    expect(stripNullCharsFromObject([])).toEqual([])
  })

  it('should handle a string input directly', () => {
    const input = 'direct\u0000string\u0000test'
    const expected = 'directstringtest'
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })

  it('should handle non-string, non-object, non-array inputs', () => {
    expect(stripNullCharsFromObject(123)).toBe(123)
    expect(stripNullCharsFromObject(true)).toBe(true)
    expect(stripNullCharsFromObject(null)).toBe(null)
    expect(stripNullCharsFromObject(undefined)).toBe(undefined)
  })

  it('should handle complex nested structures', () => {
    const input = {
      users: [
        { name: 'Alice\u0000', id: 1, roles: ['admin\u0000', 'editor'] },
        { name: 'Bob', id: 2, roles: ['viewer\u0000'] },
      ],
      settings: {
        theme: 'dark\u0000mode',
        notifications: { email: true, sms: 'no\u0000t enabled' },
      },
      status: 'active\u0000',
    }
    const expected = {
      users: [
        { name: 'Alice', id: 1, roles: ['admin', 'editor'] },
        { name: 'Bob', id: 2, roles: ['viewer'] },
      ],
      settings: {
        theme: 'darkmode',
        notifications: { email: true, sms: 'not enabled' },
      },
      status: 'active',
    }
    expect(stripNullCharsFromObject(input)).toEqual(expected)
  })
})
