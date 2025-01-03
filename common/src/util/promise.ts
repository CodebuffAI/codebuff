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
    retryDelayMs = INITIAL_RETRY_DELAY
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
      await new Promise(resolve => setTimeout(resolve, delayMs))
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
