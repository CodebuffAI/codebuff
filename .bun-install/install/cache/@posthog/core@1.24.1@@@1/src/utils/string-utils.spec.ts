import { getPersonPropertiesHash } from './string-utils'

describe('string-utils', () => {
  describe('getPersonPropertiesHash', () => {
    it('should return consistent hash regardless of top-level key order', () => {
      const hash1 = getPersonPropertiesHash('user-1', { b: 'value-b', a: 'value-a' })
      const hash2 = getPersonPropertiesHash('user-1', { a: 'value-a', b: 'value-b' })
      expect(hash1).toBe(hash2)
    })

    it('should return consistent hash regardless of nested object key order', () => {
      const hash1 = getPersonPropertiesHash('user-1', {
        nested: { z: 1, a: 2 },
      })
      const hash2 = getPersonPropertiesHash('user-1', {
        nested: { a: 2, z: 1 },
      })
      expect(hash1).toBe(hash2)
    })

    it('should return consistent hash for deeply nested objects', () => {
      const hash1 = getPersonPropertiesHash('user-1', {
        level1: {
          level2: {
            level3: { c: 3, a: 1, b: 2 },
          },
        },
      })
      const hash2 = getPersonPropertiesHash('user-1', {
        level1: {
          level2: {
            level3: { a: 1, b: 2, c: 3 },
          },
        },
      })
      expect(hash1).toBe(hash2)
    })

    it('should handle arrays with nested objects', () => {
      const hash1 = getPersonPropertiesHash('user-1', {
        items: [
          { z: 1, a: 2 },
          { y: 3, b: 4 },
        ],
      })
      const hash2 = getPersonPropertiesHash('user-1', {
        items: [
          { a: 2, z: 1 },
          { b: 4, y: 3 },
        ],
      })
      expect(hash1).toBe(hash2)
    })

    it('should preserve array order (not sort array elements)', () => {
      const hash1 = getPersonPropertiesHash('user-1', {
        items: [1, 2, 3],
      })
      const hash2 = getPersonPropertiesHash('user-1', {
        items: [3, 2, 1],
      })
      expect(hash1).not.toBe(hash2)
    })

    it('should handle null values', () => {
      const hash1 = getPersonPropertiesHash('user-1', { a: null, b: 'value' })
      const hash2 = getPersonPropertiesHash('user-1', { b: 'value', a: null })
      expect(hash1).toBe(hash2)
    })

    it('should handle primitive values', () => {
      const hash1 = getPersonPropertiesHash('user-1', {
        str: 'string',
        num: 42,
        bool: true,
        nil: null,
      })
      const hash2 = getPersonPropertiesHash('user-1', {
        nil: null,
        bool: true,
        num: 42,
        str: 'string',
      })
      expect(hash1).toBe(hash2)
    })

    it('should handle userPropertiesToSetOnce with nested objects', () => {
      const hash1 = getPersonPropertiesHash('user-1', undefined, {
        nested: { z: 1, a: 2 },
      })
      const hash2 = getPersonPropertiesHash('user-1', undefined, {
        nested: { a: 2, z: 1 },
      })
      expect(hash1).toBe(hash2)
    })

    it('should handle both userPropertiesToSet and userPropertiesToSetOnce', () => {
      const hash1 = getPersonPropertiesHash('user-1', { nested: { z: 1, a: 2 } }, { other: { y: 3, b: 4 } })
      const hash2 = getPersonPropertiesHash('user-1', { nested: { a: 2, z: 1 } }, { other: { b: 4, y: 3 } })
      expect(hash1).toBe(hash2)
    })

    it('should return different hash for different distinct_id', () => {
      const hash1 = getPersonPropertiesHash('user-1', { a: 1 })
      const hash2 = getPersonPropertiesHash('user-2', { a: 1 })
      expect(hash1).not.toBe(hash2)
    })

    it('should return different hash for different property values', () => {
      const hash1 = getPersonPropertiesHash('user-1', { a: 1 })
      const hash2 = getPersonPropertiesHash('user-1', { a: 2 })
      expect(hash1).not.toBe(hash2)
    })

    it('should handle undefined properties', () => {
      const hash1 = getPersonPropertiesHash('user-1')
      const hash2 = getPersonPropertiesHash('user-1', undefined, undefined)
      expect(hash1).toBe(hash2)
    })
  })
})
