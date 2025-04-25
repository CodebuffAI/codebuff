/**
 * A simple Least Recently Used (LRU) cache implementation using a Map.
 * It leverages the fact that Map objects maintain insertion order.
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>()

  constructor(private maxSize: number) {
    if (maxSize <= 0) {
      throw new Error('LRUCache maxSize must be a positive number.')
    }
  }

  /**
   * Retrieves an item from the cache. If found, marks it as recently used.
   * @param key The key of the item to retrieve.
   * @returns The value associated with the key, or undefined if not found.
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Mark as recently used by deleting and re-setting
      this.cache.delete(key)
      this.cache.set(key, value)
      return value
    }
    return undefined
  }

  /**
   * Adds or updates an item in the cache. If the cache exceeds maxSize,
   * the least recently used item is evicted.
   * @param key The key of the item to set.
   * @param value The value to associate with the key.
   */
  set(key: K, value: V): void {
    // If key already exists, delete it first to update its position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Check if cache is full before adding the new item
    else if (this.cache.size >= this.maxSize) {
      // Evict the least recently used item (the first item in the Map's iteration order)
      const oldestKey = this.cache.keys().next().value
      if (oldestKey !== undefined) {
        // Should always be defined if size >= maxSize > 0
        this.cache.delete(oldestKey)
      }
    }
    // Add the new item (or re-add the updated item)
    this.cache.set(key, value)
  }

  /**
   * Returns the current number of items in the cache.
   */
  get size(): number {
    return this.cache.size
  }

  /**
   * Clears all items from the cache.
   */
  clear(): void {
    this.cache.clear()
  }
}
