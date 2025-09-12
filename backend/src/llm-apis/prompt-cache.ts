/**
 * Simple in-memory cache for LLM prompts and responses
 * Cost optimization: Cache common system prompts to leverage provider caching
 */

import crypto from 'crypto'
import { logger } from '../util/logger'

interface CacheEntry<T> {
  value: T
  timestamp: number
  hits: number
}

interface CacheStats {
  hits: number
  misses: number
  entries: number
  hitRate: number
}

export class PromptCache<T = any> {
  private cache = new Map<string, CacheEntry<T>>()
  private defaultTtl: number
  private maxSize: number
  private stats = { hits: 0, misses: 0 }

  constructor(ttlMs: number = 30 * 60 * 1000, maxSize: number = 1000) { // 30 min default
    this.defaultTtl = ttlMs
    this.maxSize = maxSize
  }

  /**
   * Generate cache key from content
   */
  private generateKey(content: string | object): string {
    const str = typeof content === 'string' ? content : JSON.stringify(content)
    return crypto.createHash('sha256').update(str).digest('hex').substring(0, 16)
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry<T>, ttl?: number): boolean {
    const maxAge = ttl || this.defaultTtl
    return Date.now() - entry.timestamp > maxAge
  }

  /**
   * Evict oldest entries if cache is full
   */
  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entries (simple FIFO eviction)
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
  }

  /**
   * Get value from cache
   */
  get(key: string | object, ttl?: number): T | null {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key)
    const entry = this.cache.get(cacheKey)

    if (!entry) {
      this.stats.misses++
      return null
    }

    if (this.isExpired(entry, ttl)) {
      this.cache.delete(cacheKey)
      this.stats.misses++
      return null
    }

    entry.hits++
    this.stats.hits++
    return entry.value
  }

  /**
   * Set value in cache
   */
  set(key: string | object, value: T, ttl?: number): void {
    const cacheKey = typeof key === 'string' ? key : this.generateKey(key)
    
    this.evictIfNeeded()
    
    this.cache.set(cacheKey, {
      value,
      timestamp: Date.now(),
      hits: 0
    })
  }

  /**
   * Get or compute value with automatic caching
   */
  async getOrCompute<R = T>(
    key: string | object, 
    computeFn: () => Promise<R>,
    ttl?: number
  ): Promise<R> {
    const cached = this.get(key, ttl) as R
    if (cached !== null) {
      return cached
    }

    const computed = await computeFn()
    this.set(key, computed as unknown as T, ttl)
    return computed
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0 }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      entries: this.cache.size,
      hitRate: this.stats.hits + this.stats.misses > 0 
        ? this.stats.hits / (this.stats.hits + this.stats.misses) 
        : 0
    }
  }

  /**
   * Clean expired entries
   */
  cleanup(): number {
    let cleaned = 0
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key)
        cleaned++
      }
    }
    return cleaned
  }
}

// Global cache instances for different types of content
export const systemPromptCache = new PromptCache<string>(60 * 60 * 1000) // 1 hour TTL
export const fileTreeCache = new PromptCache<string>(30 * 60 * 1000)    // 30 min TTL  
export const responseCache = new PromptCache<any>(15 * 60 * 1000)       // 15 min TTL

// Periodic cleanup
setInterval(() => {
  const cleaned = systemPromptCache.cleanup() + 
                 fileTreeCache.cleanup() + 
                 responseCache.cleanup()
  
  if (cleaned > 0) {
    logger.debug(`Cleaned ${cleaned} expired cache entries`)
  }
}, 5 * 60 * 1000) // Every 5 minutes

// Log cache stats periodically  
setInterval(() => {
  const systemStats = systemPromptCache.getStats()
  const fileTreeStats = fileTreeCache.getStats()
  const responseStats = responseCache.getStats()
  
  logger.info({
    systemPromptCache: systemStats,
    fileTreeCache: fileTreeStats, 
    responseCache: responseStats
  }, 'Cache performance stats')
}, 30 * 60 * 1000) // Every 30 minutes