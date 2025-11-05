import { describe, test, expect, beforeEach } from 'bun:test'

import { Queue } from '../arrays'

describe('Queue', () => {
  describe('constructor', () => {
    test('creates empty queue', () => {
      const q = new Queue<number>()
      expect(q.length).toBe(0)
      expect(q.peek()).toBeUndefined()
    })

    test('creates queue from array', () => {
      const q = new Queue([1, 2, 3])
      expect(q.length).toBe(3)
      expect(q.peek()).toBe(1)
    })

    test('allocates extra capacity', () => {
      const q = new Queue([1, 2, 3])
      // Should have allocated double capacity (3 items + 3 extra)
      q.enqueue(4, 5, 6)
      expect(q.length).toBe(6)
    })
  })

  describe('Queue.from', () => {
    test('creates queue from iterable', () => {
      const q = Queue.from([1, 2, 3])
      expect(q.length).toBe(3)
      expect(q.dequeue()).toBe(1)
      expect(q.dequeue()).toBe(2)
      expect(q.dequeue()).toBe(3)
    })

    test('creates queue from Set', () => {
      const q = Queue.from(new Set([1, 2, 3]))
      expect(q.length).toBe(3)
    })

    test('creates empty queue from empty iterable', () => {
      const q = Queue.from([])
      expect(q.length).toBe(0)
    })
  })

  describe('enqueue', () => {
    test('adds single item', () => {
      const q = new Queue<number>()
      q.enqueue(1)
      expect(q.length).toBe(1)
      expect(q.peek()).toBe(1)
    })

    test('adds multiple items', () => {
      const q = new Queue<number>()
      q.enqueue(1, 2, 3)
      expect(q.length).toBe(3)
      expect(q.dequeue()).toBe(1)
      expect(q.dequeue()).toBe(2)
      expect(q.dequeue()).toBe(3)
    })

    test('grows capacity when needed', () => {
      const q = new Queue([1])
      // Initial capacity is 2 (1 item + 1 extra)
      q.enqueue(2, 3, 4)
      expect(q.length).toBe(4)
      expect(q.dequeue()).toBe(1)
      expect(q.dequeue()).toBe(2)
      expect(q.dequeue()).toBe(3)
      expect(q.dequeue()).toBe(4)
    })

    test('handles wrap-around correctly', () => {
      const q = new Queue([1, 2, 3])
      q.dequeue() // Remove 1, head moves to index 1
      q.dequeue() // Remove 2, head moves to index 2
      q.enqueue(4, 5) // Should wrap around
      expect(q.length).toBe(3)
      expect(q.dequeue()).toBe(3)
      expect(q.dequeue()).toBe(4)
      expect(q.dequeue()).toBe(5)
    })
  })

  describe('dequeue', () => {
    test('removes and returns first item', () => {
      const q = new Queue([1, 2, 3])
      expect(q.dequeue()).toBe(1)
      expect(q.length).toBe(2)
      expect(q.peek()).toBe(2)
    })

    test('returns undefined when empty', () => {
      const q = new Queue<number>()
      expect(q.dequeue()).toBeUndefined()
    })

    test('maintains FIFO order', () => {
      const q = new Queue<number>()
      q.enqueue(1, 2, 3, 4, 5)
      expect(q.dequeue()).toBe(1)
      expect(q.dequeue()).toBe(2)
      expect(q.dequeue()).toBe(3)
      expect(q.dequeue()).toBe(4)
      expect(q.dequeue()).toBe(5)
      expect(q.dequeue()).toBeUndefined()
    })

    test('wraps head pointer correctly', () => {
      const q = new Queue([1, 2])
      q.dequeue()
      q.dequeue()
      q.enqueue(3, 4)
      expect(q.dequeue()).toBe(3)
      expect(q.dequeue()).toBe(4)
    })
  })

  describe('peek', () => {
    test('returns first item without removing', () => {
      const q = new Queue([1, 2, 3])
      expect(q.peek()).toBe(1)
      expect(q.length).toBe(3)
      expect(q.peek()).toBe(1)
    })

    test('returns undefined when empty', () => {
      const q = new Queue<number>()
      expect(q.peek()).toBeUndefined()
    })

    test('tracks changes after dequeue', () => {
      const q = new Queue([1, 2, 3])
      q.dequeue()
      expect(q.peek()).toBe(2)
      q.dequeue()
      expect(q.peek()).toBe(3)
    })
  })

  describe('at', () => {
    let q: Queue<number>

    beforeEach(() => {
      q = new Queue([1, 2, 3, 4, 5])
    })

    test('returns element at positive index', () => {
      expect(q.at(0)).toBe(1)
      expect(q.at(1)).toBe(2)
      expect(q.at(2)).toBe(3)
      expect(q.at(4)).toBe(5)
    })

    test('returns element at negative index', () => {
      expect(q.at(-1)).toBe(5)
      expect(q.at(-2)).toBe(4)
      expect(q.at(-5)).toBe(1)
    })

    test('returns undefined for out of bounds index', () => {
      expect(q.at(5)).toBeUndefined()
      expect(q.at(100)).toBeUndefined()
      expect(q.at(-6)).toBeUndefined()
      expect(q.at(-100)).toBeUndefined()
    })

    test('handles wrap-around correctly', () => {
      q.dequeue() // Remove 1
      q.dequeue() // Remove 2
      q.enqueue(6, 7) // Add to wrapped positions
      expect(q.at(0)).toBe(3)
      expect(q.at(1)).toBe(4)
      expect(q.at(2)).toBe(5)
      expect(q.at(3)).toBe(6)
      expect(q.at(4)).toBe(7)
      expect(q.at(-1)).toBe(7)
    })

    test('returns undefined for empty queue', () => {
      const emptyQ = new Queue<number>()
      expect(emptyQ.at(0)).toBeUndefined()
      expect(emptyQ.at(-1)).toBeUndefined()
    })
  })

  describe('length', () => {
    test('tracks queue size', () => {
      const q = new Queue<number>()
      expect(q.length).toBe(0)
      q.enqueue(1)
      expect(q.length).toBe(1)
      q.enqueue(2, 3)
      expect(q.length).toBe(3)
      q.dequeue()
      expect(q.length).toBe(2)
      q.dequeue()
      q.dequeue()
      expect(q.length).toBe(0)
    })

    test('maintains correct length through wrap-around', () => {
      const q = new Queue([1, 2])
      q.dequeue()
      q.enqueue(3)
      expect(q.length).toBe(2)
      q.dequeue()
      expect(q.length).toBe(1)
    })
  })

  describe('edge cases', () => {
    test('handles alternating enqueue/dequeue', () => {
      const q = new Queue<number>()
      q.enqueue(1)
      expect(q.dequeue()).toBe(1)
      q.enqueue(2)
      expect(q.dequeue()).toBe(2)
      q.enqueue(3)
      expect(q.dequeue()).toBe(3)
    })

    test('handles different data types', () => {
      const stringQ = new Queue(['a', 'b', 'c'])
      expect(stringQ.dequeue()).toBe('a')

      const objectQ = new Queue([{ id: 1 }, { id: 2 }])
      expect(objectQ.dequeue()).toEqual({ id: 1 })

      const mixedQ = new Queue<string | number>([1, 'two', 3])
      expect(mixedQ.dequeue()).toBe(1)
      expect(mixedQ.dequeue()).toBe('two')
    })

    test('maintains integrity after capacity expansion', () => {
      const q = new Queue([1, 2])
      // Trigger expansion
      q.enqueue(3, 4, 5, 6, 7, 8)
      expect(q.length).toBe(8)
      for (let i = 1; i <= 8; i++) {
        expect(q.dequeue()).toBe(i)
      }
    })

    test('handles large number of operations', () => {
      const q = new Queue<number>()
      const iterations = 1000

      // Enqueue many items
      for (let i = 0; i < iterations; i++) {
        q.enqueue(i)
      }
      expect(q.length).toBe(iterations)

      // Dequeue all items
      for (let i = 0; i < iterations; i++) {
        expect(q.dequeue()).toBe(i)
      }
      expect(q.length).toBe(0)
    })
  })
})
