import { MinHeap } from './min-heap'

export class LRUCache<K, V> {
  private cache = new Map<K, { value: V; lastAccess: number }>()
  private heap = new MinHeap<K>()
  private accessCounter = 0

  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const entry = this.cache.get(key)
    if (entry) {
      // Update access time
      entry.lastAccess = ++this.accessCounter
      this.heap.insert(key, -entry.lastAccess) // Negative so oldest is at top
      return entry.value
    }
    return undefined
  }

  set(key: K, value: V): void {
    // If key exists, we need to remove its old heap entry
    if (this.cache.has(key)) {
      // Note: The old heap entry will be replaced by the new one
      this.heap.insert(key, -this.accessCounter) // Dummy insert to replace old entry
    }
    // If at capacity and this is a new key, evict oldest
    else if (this.cache.size >= this.maxSize) {
      const oldestKey = this.heap.extractMin()
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
    
    const lastAccess = ++this.accessCounter
    this.cache.set(key, { value, lastAccess })
    this.heap.insert(key, -lastAccess) // Negative so oldest is at top
  }
}
