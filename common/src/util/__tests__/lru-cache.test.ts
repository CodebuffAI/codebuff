import { describe, expect, it } from 'bun:test'

import { LRUCache } from '../lru-cache'

describe('LRUCache', () => {
  describe('constructor', () => {
    it('initializes with a valid maxSize', () => {
      const cache = new LRUCache<string, number>(5)
      expect(cache.size).toBe(0)
    })

    it('throws error when maxSize is zero', () => {
      expect(() => new LRUCache<string, number>(0)).toThrow(
        'LRUCache maxSize must be a positive number.',
      )
    })

    it('throws error when maxSize is negative', () => {
      expect(() => new LRUCache<string, number>(-5)).toThrow(
        'LRUCache maxSize must be a positive number.',
      )
    })
  })

  describe('basic get and set', () => {
    it('returns undefined for non-existent keys', () => {
      const cache = new LRUCache<string, string>(3)
      expect(cache.get('unknown')).toBeUndefined()
    })

    it('stores and retrieves values by key', () => {
      const cache = new LRUCache<string, string>(3)
      cache.set('a', 'alpha')
      cache.set('b', 'beta')

      expect(cache.get('a')).toBe('alpha')
      expect(cache.get('b')).toBe('beta')
      expect(cache.size).toBe(2)
    })

    it('updates existing keys without increasing size', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('count', 1)
      expect(cache.size).toBe(1)
      expect(cache.get('count')).toBe(1)

      cache.set('count', 2)
      expect(cache.size).toBe(1)
      expect(cache.get('count')).toBe(2)
    })

    it('clears all items and resets size to 0', () => {
      const cache = new LRUCache<string, number>(3)
      cache.set('x', 10)
      cache.set('y', 20)
      expect(cache.size).toBe(2)

      cache.clear()
      expect(cache.size).toBe(0)
      expect(cache.get('x')).toBeUndefined()
      expect(cache.get('y')).toBeUndefined()
    })
  })

  describe('eviction and recency order', () => {
    it('evicts the least recently added item when capacity is exceeded', () => {
      const cache = new LRUCache<string, number>(2)
      cache.set('a', 1)
      cache.set('b', 2)
      cache.set('c', 3) // Evicts 'a'

      expect(cache.get('a')).toBeUndefined()
      expect(cache.get('b')).toBe(2)
      expect(cache.get('c')).toBe(3)
      expect(cache.size).toBe(2)
    })

    it('marks an item as recently used on get() so it avoids eviction', () => {
      const cache = new LRUCache<string, number>(2)
      cache.set('a', 1)
      cache.set('b', 2)

      // Access 'a', making 'b' the least recently used
      expect(cache.get('a')).toBe(1)

      // Add 'c' - should evict 'b' instead of 'a'
      cache.set('c', 3)

      expect(cache.get('a')).toBe(1)
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(3)
    })

    it('marks an item as recently used on set() update so it avoids eviction', () => {
      const cache = new LRUCache<string, number>(2)
      cache.set('a', 1)
      cache.set('b', 2)

      // Update 'a', making 'b' the least recently used
      cache.set('a', 10)

      // Add 'c' - should evict 'b' instead of 'a'
      cache.set('c', 30)

      expect(cache.get('a')).toBe(10)
      expect(cache.get('b')).toBeUndefined()
      expect(cache.get('c')).toBe(30)
    })

    it('handles multiple sequential evictions with capacity 1', () => {
      const cache = new LRUCache<string, string>(1)
      cache.set('first', '1')
      expect(cache.get('first')).toBe('1')

      cache.set('second', '2')
      expect(cache.get('first')).toBeUndefined()
      expect(cache.get('second')).toBe('2')
      expect(cache.size).toBe(1)
    })
  })

  describe('support for different key/value types', () => {
    it('supports numeric keys and object values', () => {
      const cache = new LRUCache<number, { name: string }>(2)
      const obj1 = { name: 'Item 1' }
      const obj2 = { name: 'Item 2' }

      cache.set(100, obj1)
      cache.set(200, obj2)

      expect(cache.get(100)).toEqual({ name: 'Item 1' })
      expect(cache.get(200)).toEqual({ name: 'Item 2' })
    })
  })
})
