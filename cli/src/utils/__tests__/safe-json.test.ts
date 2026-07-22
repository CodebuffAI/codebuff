import { describe, test, expect } from 'bun:test'

import { classifyStringifyError, serializeForPersistence } from '../safe-json'

describe('safe-json', () => {
  describe('classifyStringifyError', () => {
    test('recognizes Bun and Node cyclic-structure messages', () => {
      expect(
        classifyStringifyError(
          new TypeError('JSON.stringify cannot serialize cyclic structures.'),
        ),
      ).toBe('cyclic')
      expect(
        classifyStringifyError(
          new TypeError('Converting circular structure to JSON'),
        ),
      ).toBe('cyclic')
    })

    test('recognizes memory/string-limit messages', () => {
      expect(classifyStringifyError(new RangeError('Out of memory'))).toBe(
        'oom',
      )
      expect(
        classifyStringifyError(new RangeError('Invalid string length')),
      ).toBe('oom')
    })

    test('returns null for unrelated errors', () => {
      expect(classifyStringifyError(new Error('ENOSPC: no space left'))).toBe(
        null,
      )
    })
  })

  describe('serializeForPersistence', () => {
    test('plain payloads serialize without a fallback report', () => {
      const result = serializeForPersistence({ a: 1, b: ['x'] })
      expect(result.json).toBe('{"a":1,"b":["x"]}')
      expect(result.fallback).toBeUndefined()
    })

    test('breaks cycles and reports the cycle path', () => {
      const node: any = { name: 'root', child: { name: 'child' } }
      node.child.parent = node

      const result = serializeForPersistence(node)
      expect(result.fallback?.reason).toBe('cyclic')
      expect(result.fallback?.cyclePaths.length).toBeGreaterThan(0)
      const parsed = JSON.parse(result.json)
      expect(parsed.child.parent).toBe('[Circular]')
      expect(parsed.child.name).toBe('child')
    })

    test('preserves shared non-cyclic references', () => {
      const shared = { v: 42 }
      const node: any = { a: shared, b: shared, cycle: {} }
      node.cycle.self = node

      const parsed = JSON.parse(serializeForPersistence(node).json)
      expect(parsed.a).toEqual({ v: 42 })
      expect(parsed.b).toEqual({ v: 42 })
      expect(parsed.cycle.self).toBe('[Circular]')
    })

    test('rethrows the original error for unclassifiable failures', () => {
      const throwing = {
        toJSON() {
          throw new Error('serializer exploded')
        },
      }
      expect(() => serializeForPersistence(throwing)).toThrow(
        'serializer exploded',
      )
    })
  })
})
