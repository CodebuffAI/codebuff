/**
 * Activity-aware Query Hook
 *
 * A custom React hook that provides caching and refetching based on user activity.
 * Designed for terminal-specific activity awareness:
 * - Detects when user is active (typing, mouse movement, keyboard shortcuts)
 * - Can pause polling when user is idle to save resources
 * - Can refetch stale data when user becomes active again
 *
 * This module re-exports utility functions for backwards compatibility with
 * existing code that imports them from here.
 */

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import { isUserActive, subscribeToActivity } from '../utils/activity-tracker'
import {
  serializeQueryKey,
  subscribeToKey,
  getKeySnapshot,
  getCacheEntry,
  isEntryStale as checkEntryStale,
  incrementRefCount,
  decrementRefCount,
  getRefCount,
  setGcTimeout,
  clearGcTimeout,
  resetCache,
} from '../utils/query-cache'
import {
  createQueryExecutor,
  clearRetryState,
  resetExecutorState,
} from '../utils/query-executor'
import {
  invalidateQuery,
  removeQuery,
  getQueryData,
  setQueryData,
  fullDeleteCacheEntry,
} from '../utils/query-invalidation'

// Re-export isEntryStale for backwards compatibility (tests import it)
export { isEntryStale } from '../utils/query-cache'

export type UseActivityQueryOptions<T> = {
  /** Unique key for caching the query */
  queryKey: readonly unknown[]
  /** Function that fetches the data */
  queryFn: () => Promise<T>
  /** Whether the query is enabled (default: true) */
  enabled?: boolean
  /** Time in ms before data is considered stale (default: 0) */
  staleTime?: number
  /** Time in ms to keep unused cache entries (default: 5 minutes) */
  gcTime?: number
  /** Number of retry attempts on failure (default: 0) */
  retry?: number | false
  /** Interval in ms to refetch data (default: false/disabled) */
  refetchInterval?: number | false

  /** Refetch when component mounts (default: false) */
  refetchOnMount?: boolean | 'always'
  /** Refetch stale data when user becomes active after being idle (default: false) */
  refetchOnActivity?: boolean
  /** Pause polling when user is idle (default: false) */
  pauseWhenIdle?: boolean
  /** Time in ms to consider user idle (default: 30 seconds) */
  idleThreshold?: number
}

export type UseActivityQueryResult<T> = {
  /** The query data, undefined if not yet fetched */
  data: T | undefined
  /** Whether the initial fetch is in progress */
  isLoading: boolean
  /** Whether any fetch (initial or refetch) is in progress */
  isFetching: boolean
  /** Whether the query has successfully fetched data */
  isSuccess: boolean
  /** Error from the last fetch attempt */
  error: Error | null
  /** Manually trigger a refetch */
  refetch: () => Promise<void>
}

/**
 * Activity-aware query hook that provides caching and refetching based on user activity.
 */
export function useActivityQuery<T>(
  options: UseActivityQueryOptions<T>,
): UseActivityQueryResult<T> {
  const {
    queryKey,
    queryFn,
    enabled = true,
    staleTime = 0,
    gcTime = 5 * 60 * 1000,
    retry = 0,
    refetchInterval = false,
    refetchOnMount = false,
    refetchOnActivity = false,
    pauseWhenIdle = false,
    idleThreshold = 30_000,
  } = options

  const serializedKey = serializeQueryKey(queryKey)
  const mountedRef = useRef(true)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const wasIdleRef = useRef(false)

  // Store queryFn in a ref to avoid recreating doFetch when queryFn changes.
  const queryFnRef = useRef(queryFn)
  queryFnRef.current = queryFn

  // Store config values in refs to avoid triggering refetches when they change
  // (they only affect the *decision* to fetch, not the fetch itself)
  const refetchOnMountRef = useRef(refetchOnMount)
  refetchOnMountRef.current = refetchOnMount
  const staleTimeRef = useRef(staleTime)
  staleTimeRef.current = staleTime
  // Store enabled in a ref so retry callbacks can check current state
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled

  // Snapshot includes entry + isFetching (so fetch-status updates rerender correctly)
  const snap = useSyncExternalStore(
    (cb) => subscribeToKey(serializedKey, cb),
    () => getKeySnapshot<T>(serializedKey),
    () => getKeySnapshot<T>(serializedKey),
  )

  const cachedEntry = snap.entry
  const isFetching = snap.isFetching

  const data = cachedEntry?.data
  const error = cachedEntry?.error ?? null
  const dataUpdatedAt = cachedEntry?.dataUpdatedAt ?? 0

  // Initial load = fetching with no successful data yet
  const isLoading = isFetching && (cachedEntry == null || dataUpdatedAt === 0)

  // Create the fetch function using the query executor
  const doFetch = useCallback(() => {
    if (!enabled) return Promise.resolve()

    const executor = createQueryExecutor({
      key: serializedKey,
      queryFn: () => queryFnRef.current(),
      retry,
      // Pass isEnabled callback so retries can check if query is still enabled
      isEnabled: () => enabledRef.current,
    })
    return executor()
  }, [enabled, serializedKey, retry])

  const refetch = useCallback(async (): Promise<void> => {
    clearRetryState(serializedKey)
    await doFetch()
  }, [doFetch, serializedKey])

  // Refcount + cancel pending GC when (re)subscribing
  useEffect(() => {
    clearGcTimeout(serializedKey)
    wasIdleRef.current = false
    incrementRefCount(serializedKey)

    return () => {
      const next = decrementRefCount(serializedKey)

      // If last observer is gone, don't keep retry timers around.
      if (next === 0) {
        clearRetryState(serializedKey)
      }
    }
  }, [serializedKey])

  // Initial fetch on mount/key change/enabled toggle
  useEffect(() => {
    mountedRef.current = true
    if (!enabled) return

    const currentEntry = getCacheEntry<T>(serializedKey)
    const currentStaleTime = staleTimeRef.current
    const currentlyStale =
      !currentEntry ||
      currentEntry.dataUpdatedAt === 0 ||
      currentStaleTime === 0 ||
      Date.now() - currentEntry.dataUpdatedAt > currentStaleTime

    const currentRefetchOnMount = refetchOnMountRef.current
    const shouldFetchOnMount =
      currentRefetchOnMount === 'always' ||
      (currentRefetchOnMount && currentlyStale) ||
      !currentEntry

    if (shouldFetchOnMount) void doFetch()

    return () => {
      mountedRef.current = false
    }
  }, [enabled, serializedKey, doFetch])

  // Polling
  useEffect(() => {
    if (!enabled || !refetchInterval) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      return
    }

    const tick = () => {
      if (pauseWhenIdle && !isUserActive(idleThreshold)) {
        wasIdleRef.current = true
        return
      }
      if (checkEntryStale(serializedKey, staleTime)) {
        void doFetch()
      }
    }

    intervalRef.current = setInterval(tick, refetchInterval)
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [enabled, refetchInterval, pauseWhenIdle, idleThreshold, staleTime, serializedKey, doFetch])

  // Refetch on activity after idle
  useEffect(() => {
    if (!enabled || !refetchOnActivity) return

    const unsubscribe = subscribeToActivity(() => {
      if (wasIdleRef.current) {
        wasIdleRef.current = false
        if (checkEntryStale(serializedKey, staleTime)) {
          void doFetch()
        }
      }
    })

    const checkIdle = setInterval(() => {
      if (!isUserActive(idleThreshold)) {
        wasIdleRef.current = true
      }
    }, 5000)

    return () => {
      unsubscribe()
      clearInterval(checkIdle)
    }
  }, [enabled, refetchOnActivity, idleThreshold, staleTime, serializedKey, doFetch])

  // Garbage collection - store gcTime in a ref so cleanup uses the value at unmount time
  const gcTimeRef = useRef(gcTime)
  gcTimeRef.current = gcTime
  useEffect(() => {
    return () => {
      const currentGcTime = gcTimeRef.current
      const timeoutId = setTimeout(() => {
        if (getRefCount(serializedKey) === 0) {
          fullDeleteCacheEntry(serializedKey)
        }
      }, currentGcTime)

      setGcTimeout(serializedKey, timeoutId)
    }
  }, [serializedKey])

  return {
    data,
    isLoading,
    isFetching,
    isSuccess: cachedEntry != null && cachedEntry.error == null && cachedEntry.dataUpdatedAt !== 0,
    error,
    refetch,
  }
}

// Backwards-compatible exports that delegate to the new modules

/**
 * Invalidate a query, causing it to refetch on next access.
 */
export function invalidateActivityQuery(queryKey: readonly unknown[]): void {
  invalidateQuery(queryKey)
}

/**
 * Remove a query from the cache entirely.
 */
export function removeActivityQuery(queryKey: readonly unknown[]): void {
  removeQuery(queryKey)
}

/**
 * Read cached data.
 */
export function getActivityQueryData<T>(queryKey: readonly unknown[]): T | undefined {
  return getQueryData<T>(queryKey)
}

/**
 * Write cached data (optimistic updates).
 */
export function setActivityQueryData<T>(queryKey: readonly unknown[], data: T): void {
  setQueryData(queryKey, data)
}

export function useInvalidateActivityQuery() {
  return useCallback((queryKey: readonly unknown[]) => {
    invalidateActivityQuery(queryKey)
  }, [])
}

/**
 * Reset the activity query cache (mainly for testing).
 */
export function resetActivityQueryCache(): void {
  resetCache()
  resetExecutorState()
}
