export const INITIAL_RETRY_DELAY = 1000 // 1 second

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    retryIf?: (error: any) => boolean
    onRetry?: (error: any, attempt: number) => void
    retryDelayMs?: number
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    retryIf = (error) => error?.type === 'APIConnectionError',
    onRetry = () => {},
    retryDelayMs = INITIAL_RETRY_DELAY,
  } = options

  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!retryIf(error) || attempt === maxRetries - 1) {
        throw error
      }

      onRetry(error, attempt + 1)

      // Exponential backoff with jitter (±20%) to prevent thundering herd
      const baseDelayMs = retryDelayMs * Math.pow(2, attempt)
      const jitter = 0.8 + Math.random() * 0.4 // Random multiplier between 0.8 and 1.2
      const delayMs = Math.round(baseDelayMs * jitter)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Wraps a promise with a timeout.
 *
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds. A non-positive value (0, -1, etc.)
 *   disables the timeout entirely — the returned promise just resolves with
 *   `promise`'s result (no timer is created, no controller is aborted).
 * @param timeoutMessage Optional message for the timeout error
 * @param options.controller Optional AbortController. On a deadline, the timer
 *   aborts this controller BEFORE rejecting the outer promise. Callers that
 *   thread the controller's signal into an underlying async operation (e.g.
 *   loopAgentSteps) thus get a real cancellation instead of an orphaned
 *   background stream. On success the controller is left untouched.
 * @returns A promise that resolves with the result of the original promise or
 *   rejects with a timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = `Operation timed out after ${timeoutMs}ms`,
  options: { controller?: AbortController } = {},
): Promise<T> {
  // Non-positive timeoutMs = no timeout. Avoid creating a timer (which would
  // immediately fire for 0) and avoid holding the controller hostage.
  if (!timeoutMs || timeoutMs <= 0) {
    return promise
  }

  const { controller } = options
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      // Abort the underlying operation BEFORE rejecting so the stuck stream
      // actually stops, rather than orphaning it.
      if (controller && !controller.signal.aborted) {
        try {
          controller.abort(
            new Error(`withTimeout aborted after ${timeoutMs}ms: ${timeoutMessage}`),
          )
        } catch {
          // controller.abort() never throws for an un-aborted controller, but
          // be defensive: the timeout path must always reject.
        }
      }
      reject(new Error(timeoutMessage))
    }, timeoutMs)
  })

  return Promise.race([
    promise.then((result) => {
      clearTimeout(timeoutId)
      return result
    }),
    timeoutPromise,
  ])
}
