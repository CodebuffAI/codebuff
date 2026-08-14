import { describe, expect, it } from 'bun:test'

import { MinHeap } from '../min-heap'

describe('MinHeap', () => {
  it('initializes with size 0', () => {
    const heap = new MinHeap<string>()
    expect(heap.size).toBe(0)
  })

  it('returns undefined when extracting from an empty heap', () => {
    const heap = new MinHeap<string>()
    expect(heap.extractMin()).toBeUndefined()
  })

  it('inserts and extracts a single element', () => {
    const heap = new MinHeap<string>()
    heap.insert('item1', 10)

    expect(heap.size).toBe(1)
    expect(heap.extractMin()).toBe('item1')
    expect(heap.size).toBe(0)
    expect(heap.extractMin()).toBeUndefined()
  })

  it('extracts elements in ascending order of score', () => {
    const heap = new MinHeap<string>()
    heap.insert('c', 30)
    heap.insert('a', 10)
    heap.insert('b', 20)
    heap.insert('e', 50)
    heap.insert('d', 40)

    expect(heap.size).toBe(5)
    expect(heap.extractMin()).toBe('a')
    expect(heap.extractMin()).toBe('b')
    expect(heap.extractMin()).toBe('c')
    expect(heap.extractMin()).toBe('d')
    expect(heap.extractMin()).toBe('e')
    expect(heap.size).toBe(0)
  })

  it('handles negative and floating-point scores', () => {
    const heap = new MinHeap<string>()
    heap.insert('zero', 0)
    heap.insert('neg', -15.5)
    heap.insert('pos', 3.14)
    heap.insert('more-neg', -100)

    expect(heap.extractMin()).toBe('more-neg')
    expect(heap.extractMin()).toBe('neg')
    expect(heap.extractMin()).toBe('zero')
    expect(heap.extractMin()).toBe('pos')
  })

  it('handles items with duplicate scores', () => {
    const heap = new MinHeap<string>()
    heap.insert('task1', 5)
    heap.insert('task2', 5)
    heap.insert('task3', 1)

    expect(heap.extractMin()).toBe('task3')
    const next1 = heap.extractMin()
    const next2 = heap.extractMin()
    expect([next1, next2].sort()).toEqual(['task1', 'task2'])
    expect(heap.size).toBe(0)
  })

  it('supports interleaved insertions and extractions', () => {
    const heap = new MinHeap<number>()
    heap.insert(100, 100)
    heap.insert(50, 50)
    expect(heap.extractMin()).toBe(50)

    heap.insert(20, 20)
    heap.insert(80, 80)
    expect(heap.extractMin()).toBe(20)
    expect(heap.extractMin()).toBe(80)
    expect(heap.extractMin()).toBe(100)
    expect(heap.extractMin()).toBeUndefined()
  })
})
