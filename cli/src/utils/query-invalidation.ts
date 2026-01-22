import {
  serializeQueryKey,
  getCacheEntry,
  setCacheEntry,
  deleteCacheEntryCore,
  clearGcTimeout,
} from './query-cache'
import { clearRetryState, deleteInFlightPromise } from './query-executor'

/** Invalidate a query, causing it to refetch on next access. */
export function invalidateQuery(queryKey: readonly unknown[]): void {
  const key = serializeQueryKey(queryKey)
  const entry = getCacheEntry(key)
  if (!entry) return
  setCacheEntry(key, { ...entry, dataUpdatedAt: 0 })
}

/** Remove a query from the cache entirely. */
export function removeQuery(queryKey: readonly unknown[]): void {
  const key = serializeQueryKey(queryKey)
  fullDeleteCacheEntry(key)
}

/** Fully delete a cache entry and all associated state (GC, retry, in-flight). */
export function fullDeleteCacheEntry(key: string): void {
  clearGcTimeout(key)
  clearRetryState(key)
  deleteInFlightPromise(key)
  deleteCacheEntryCore(key)
}

export function getQueryData<T>(queryKey: readonly unknown[]): T | undefined {
  const key = serializeQueryKey(queryKey)
  return getCacheEntry<T>(key)?.data
}

export function setQueryData<T>(queryKey: readonly unknown[], data: T): void {
  const key = serializeQueryKey(queryKey)
  setCacheEntry(key, {
    data,
    dataUpdatedAt: Date.now(),
    error: null,
    errorUpdatedAt: null,
  })
}
