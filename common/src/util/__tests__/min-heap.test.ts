import { describe, expect, test } from 'bun:test'

import { MinHeap } from '../min-heap'

describe('MinHeap', () => {
  test('extractMin returns undefined on an empty heap', () => {
    const heap = new MinHeap<number>()
    expect(heap.extractMin()).toBeUndefined()
    expect(heap.size).toBe(0)
  })

  test('inserts and extracts a single element', () => {
    const heap = new MinHeap<string>()
    heap.insert('only', 5)
    expect(heap.size).toBe(1)
    expect(heap.extractMin()).toBe('only')
    expect(heap.size).toBe(0)
  })

  test('extracts elements in ascending score order', () => {
    const heap = new MinHeap<number>()
    const scores = [42, 7, 19, 3, 88, 1, 25]
    scores.forEach((s, i) => heap.insert(i, s))

    const out: number[] = []
    while (heap.size > 0) {
      out.push(heap.extractMin()!)
    }
    // Items were inserted as index -> score. Sorted ascending by score:
    // idx5(1), idx3(3), idx1(7), idx2(19), idx6(25), idx0(42), idx4(88)
    expect(out).toEqual([5, 3, 1, 2, 6, 0, 4])
  })

  test('preserves min-heap invariant under arbitrary interleave of insert/extract', () => {
    const heap = new MinHeap<{ id: number; v: number }>()
    heap.insert({ id: 0, v: 100 }, 100)
    heap.insert({ id: 1, v: 1 }, 1)
    expect(heap.extractMin()!.id).toBe(1)
    heap.insert({ id: 2, v: 50 }, 50)
    heap.insert({ id: 3, v: 2 }, 2)
    expect(heap.extractMin()!.id).toBe(3)
    expect(heap.extractMin()!.id).toBe(2)
    expect(heap.extractMin()!.id).toBe(0)
    expect(heap.extractMin()).toBeUndefined()
  })

  test('handles duplicate scores (all equal-score items drain; min-heap does not guarantee FIFO among ties)', () => {
    const heap = new MinHeap<number>()
    heap.insert(10, 5)
    heap.insert(20, 5)
    heap.insert(30, 5)
    const out = [heap.extractMin()!, heap.extractMin()!, heap.extractMin()!]
    expect(out.sort((a, b) => a - b)).toEqual([10, 20, 30])
    expect(heap.size).toBe(0)
  })

  test('extractMin on a heap that was just drained does not throw', () => {
    const heap = new MinHeap<number>()
    heap.insert(1, 1)
    heap.extractMin()
    heap.extractMin() // second drain
    expect(heap.size).toBe(0)
  })

  test('inserting a new minimum bubbles it to the root', () => {
    const heap = new MinHeap<number>()
    heap.insert(10, 10)
    heap.insert(20, 20)
    heap.insert(5, 5) // new min
    expect(heap.extractMin()).toBe(5)
    expect(heap.extractMin()).toBe(10)
    expect(heap.extractMin()).toBe(20)
  })
})
