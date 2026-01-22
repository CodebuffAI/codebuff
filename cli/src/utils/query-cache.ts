// Cache entry storing data, timestamps, and error state
export type CacheEntry<T> = {
  // Allow error-only entries (first fetch failure) without pretending data exists
  data?: T
  dataUpdatedAt: number // 0 means "no successful data yet" (also stale)
  error: Error | null
  errorUpdatedAt: number | null
}

// Snapshot of a cache key's state (entry + fetching status)
export type KeySnapshot<T> = {
  entry: CacheEntry<T> | undefined
  isFetching: boolean
}

// Internal cache state structure
type CacheState = {
  entries: Map<string, CacheEntry<unknown>>
  keyListeners: Map<string, Set<() => void>>
  refCounts: Map<string, number>
  fetchingKeys: Set<string>
}

// Global cache singleton
const cache: CacheState = {
  entries: new Map(),
  keyListeners: new Map(),
  refCounts: new Map(),
  fetchingKeys: new Set(),
}

// Per-key snapshot memoization for efficient useSyncExternalStore usage
const snapshotMemo = new Map<
  string,
  {
    entryRef: CacheEntry<unknown> | undefined
    fetching: boolean
    snap: KeySnapshot<unknown>
  }
>()

// Module-level map to track GC timeouts (survives component unmount)
// Prefer using the helper functions below over direct map access
const gcTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

/** Set a GC timeout for a key. */
export function setGcTimeout(key: string, timeoutId: ReturnType<typeof setTimeout>): void {
  gcTimeouts.set(key, timeoutId)
}

/** Clear and delete a GC timeout for a key. */
export function clearGcTimeout(key: string): void {
  const t = gcTimeouts.get(key)
  if (t) clearTimeout(t)
  gcTimeouts.delete(key)
}

// Per-key generation to prevent "resurrecting" deleted entries from late in-flight responses
const generations = new Map<string, number>()

export function serializeQueryKey(queryKey: readonly unknown[]): string {
  return JSON.stringify(queryKey)
}

function notifyKeyListeners(key: string): void {
  const listeners = cache.keyListeners.get(key)
  if (!listeners) return
  for (const listener of listeners) listener()
}

export function subscribeToKey(key: string, callback: () => void): () => void {
  let listeners = cache.keyListeners.get(key)
  if (!listeners) {
    listeners = new Set()
    cache.keyListeners.set(key, listeners)
  }
  listeners.add(callback)
  return () => {
    listeners!.delete(callback)
    if (listeners!.size === 0) {
      cache.keyListeners.delete(key)
    }
  }
}

export function getKeySnapshot<T>(key: string): KeySnapshot<T> {
  const entry = cache.entries.get(key) as CacheEntry<T> | undefined
  const fetching = cache.fetchingKeys.has(key)

  const memo = snapshotMemo.get(key)
  if (memo && memo.entryRef === (entry as CacheEntry<unknown> | undefined) && memo.fetching === fetching) {
    return memo.snap as KeySnapshot<T>
  }

  const snap: KeySnapshot<T> = { entry, isFetching: fetching }
  snapshotMemo.set(key, {
    entryRef: entry as CacheEntry<unknown> | undefined,
    fetching,
    snap: snap as KeySnapshot<unknown>,
  })
  return snap
}

export function setCacheEntry<T>(key: string, entry: CacheEntry<T>): void {
  cache.entries.set(key, entry as CacheEntry<unknown>)
  snapshotMemo.delete(key)
  notifyKeyListeners(key)
}

export function getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
  return cache.entries.get(key) as CacheEntry<T> | undefined
}

export function isEntryStale(key: string, staleTime: number): boolean {
  const entry = getCacheEntry(key)
  if (!entry) return true
  if (entry.dataUpdatedAt === 0) return true
  return staleTime === 0 || Date.now() - entry.dataUpdatedAt > staleTime
}

export function setQueryFetching(key: string, fetching: boolean): void {
  const wasFetching = cache.fetchingKeys.has(key)
  if (fetching) cache.fetchingKeys.add(key)
  else cache.fetchingKeys.delete(key)

  if (wasFetching !== fetching) {
    snapshotMemo.delete(key)
    notifyKeyListeners(key)
  }
}

export function isQueryFetching(key: string): boolean {
  return cache.fetchingKeys.has(key)
}

export function incrementRefCount(key: string): void {
  const current = cache.refCounts.get(key) ?? 0
  cache.refCounts.set(key, current + 1)
}

export function decrementRefCount(key: string): number {
  const current = cache.refCounts.get(key) ?? 0
  const next = Math.max(0, current - 1)
  if (next === 0) cache.refCounts.delete(key)
  else cache.refCounts.set(key, next)
  return next
}

export function getRefCount(key: string): number {
  return cache.refCounts.get(key) ?? 0
}

export function bumpGeneration(key: string): void {
  generations.set(key, (generations.get(key) ?? 0) + 1)
}

export function getGeneration(key: string): number {
  return generations.get(key) ?? 0
}

/**
 * Core cache entry deletion. Only clears cache-module state.
 * Use fullDeleteCacheEntry from query-invalidation for complete cleanup
 * (including retry state, in-flight promises, and GC timeouts).
 * @internal
 */
export function deleteCacheEntryCore(key: string): void {
  bumpGeneration(key)
  cache.fetchingKeys.delete(key)
  cache.entries.delete(key)
  cache.refCounts.delete(key)
  snapshotMemo.delete(key)
  notifyKeyListeners(key)
  // NOTE: We intentionally do NOT delete the generation counter here.
  // The bumped generation must persist so that in-flight requests see a different
  // generation when they complete and will not "resurrect" the deleted entry.
  // Memory impact is minimal (just a number per deleted key). Generations are
  // cleaned up during resetCache() which is used for testing.
}

export function resetCache(): void {
  for (const timeoutId of gcTimeouts.values()) {
    clearTimeout(timeoutId)
  }
  gcTimeouts.clear()

  cache.entries.clear()
  cache.keyListeners.clear()
  cache.refCounts.clear()
  cache.fetchingKeys.clear()

  snapshotMemo.clear()
  generations.clear()
}
