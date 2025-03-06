export const INITIAL_RETRY_DELAY = 1000 // 1 second

export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxRetries?: number
    shouldRetry?: (error: any) => boolean
    onRetry?: (error: any, attempt: number) => void
    retryDelayMs?: number
  } = {}
): Promise<T> {
  const {
    maxRetries = 3,
    shouldRetry = (error) => error?.type === 'APIConnectionError',
    onRetry = () => {},
    retryDelayMs = INITIAL_RETRY_DELAY,
  } = options

  let lastError: any = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error

      if (!shouldRetry(error) || attempt === maxRetries - 1) {
        throw error
      }

      onRetry(error, attempt + 1)

      // Exponential backoff
      const delayMs = retryDelayMs * Math.pow(2, attempt)
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }

  throw lastError
}

export const mapAsync = <T, U>(
  items: T[],
  f: (item: T, index: number) => Promise<U>,
  maxConcurrentRequests = 20
) => {
  let index = 0
  let currRequests = 0
  const results: U[] = []

  return new Promise((resolve: (results: U[]) => void, reject) => {
    const doWork = () => {
      while (index < items.length && currRequests < maxConcurrentRequests) {
        const itemIndex = index
        f(items[itemIndex], itemIndex)
          .then((data) => {
            results[itemIndex] = data
            currRequests--
            if (index === items.length && currRequests === 0) resolve(results)
            else doWork()
          })
          .catch(reject)

        index++
        currRequests++
      }
    }

    if (items.length === 0) resolve([])
    else doWork()
  })
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Wraps a promise with a timeout
 * @param promise The promise to wrap
 * @param timeoutMs Timeout in milliseconds
 * @param timeoutMessage Optional message for the timeout error
 * @returns A promise that resolves with the result of the original promise or rejects with a timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string = 'Operation timed out'
): Promise<T> {
  let timeoutId: NodeJS.Timeout

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
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
