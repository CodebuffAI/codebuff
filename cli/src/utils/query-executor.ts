import {
  getCacheEntry,
  setCacheEntry,
  setQueryFetching,
  getRefCount,
  getGeneration,
} from './query-cache'

// In-flight promises for request deduplication
const inFlight = new Map<string, Promise<unknown>>()

// Per-key retry state (so unmounting one observer doesn't cancel retries for others)
const retryCounts = new Map<string, number>()
const retryTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

export function clearRetryTimeout(key: string): void {
  const t = retryTimeouts.get(key)
  if (t) clearTimeout(t)
  retryTimeouts.delete(key)
}

export function clearRetryState(key: string): void {
  clearRetryTimeout(key)
  retryCounts.delete(key)
}

export function deleteInFlightPromise(key: string): void {
  inFlight.delete(key)
}

export function getRetryCount(key: string): number {
  return retryCounts.get(key) ?? 0
}

export function setRetryCount(key: string, count: number): void {
  retryCounts.set(key, count)
}

export function scheduleRetry(
  key: string,
  retryAttempt: number,
  onRetry: () => void,
): void {
  // Only clear existing timeout, not the retry count (it was just set by caller)
  clearRetryTimeout(key)
  const t = setTimeout(() => {
    retryTimeouts.delete(key)
    onRetry()
  }, 1000 * retryAttempt)
  retryTimeouts.set(key, t)
}

export type ExecuteQueryOptions<T> = {
  key: string
  queryFn: () => Promise<T>
  retry: number | false
  /** Optional callback to check if the query is still enabled. Used to cancel retries when disabled. */
  isEnabled?: () => boolean
}

export function createQueryExecutor<T>(
  options: ExecuteQueryOptions<T>,
): () => Promise<void> {
  const { key, queryFn, retry, isEnabled } = options

  const doFetch = async (): Promise<void> => {
    // Global dedupe
    const existing = inFlight.get(key)
    if (existing) {
      await existing
      return
    }

    const myGen = getGeneration(key)
    setQueryFetching(key, true)

    const fetchPromise = (async () => {
      try {
        const result = await queryFn()

        // If someone removed/GC'd this key while we were in-flight, don't resurrect it.
        if (getGeneration(key) !== myGen) return

        setCacheEntry(key, {
          data: result,
          dataUpdatedAt: Date.now(),
          error: null,
          errorUpdatedAt: null,
        })
        retryCounts.set(key, 0)
      } catch (err) {
        const e = err instanceof Error ? err : new Error(String(err))
        const maxRetries = retry === false ? 0 : retry
        const currentRetries = retryCounts.get(key) ?? 0

        if (currentRetries < maxRetries && getRefCount(key) > 0) {
          const next = currentRetries + 1
          retryCounts.set(key, next)

          // Allow a new in-flight request for the retry attempt
          inFlight.delete(key)
          setQueryFetching(key, false)

          scheduleRetry(key, next, () => {
            // Only retry if still mounted somewhere, key not deleted, and query still enabled
            const stillEnabled = isEnabled ? isEnabled() : true
            if (getRefCount(key) > 0 && getGeneration(key) === myGen && stillEnabled) {
              void doFetch()
            }
          })
          return
        }

        retryCounts.set(key, 0)

        // Store error even if we have no existing data (error-only entry).
        if (getGeneration(key) !== myGen) return

        const existingEntry = getCacheEntry<T>(key)
        setCacheEntry(key, {
          data: existingEntry?.data,
          dataUpdatedAt: existingEntry?.dataUpdatedAt ?? 0,
          error: e,
          errorUpdatedAt: Date.now(),
        })
      } finally {
        inFlight.delete(key)
        setQueryFetching(key, false)

        // If nobody is watching and the entry was deleted, keep things tidy.
        if (getRefCount(key) === 0) {
          clearRetryState(key)
        }
      }
    })()

    inFlight.set(key, fetchPromise)
    await fetchPromise
  }

  return doFetch
}

export function resetExecutorState(): void {
  for (const t of retryTimeouts.values()) clearTimeout(t)
  retryTimeouts.clear()
  retryCounts.clear()
  inFlight.clear()
}
