import { remove } from 'lodash'
import { APIError } from 'common/api/utils'

export const DEFAULT_QUEUE_TIME_LIMIT = 10_000

type WorkItem = {
  fn: () => Promise<any>
  dependencies: string[]
  resolve: (value: any) => void
  reject: (reason: any) => void
  timestamp: number
}

export const createFnQueue = (props?: { timeout?: number }) => {
  const { timeout = DEFAULT_QUEUE_TIME_LIMIT } = props || {}

  const state = {
    fnQueue: [] as WorkItem[],
    activeItems: [] as WorkItem[],
  }
  const { fnQueue, activeItems } = state

  const enqueuePrivate = async <T>(
    fn: () => Promise<T>,
    dependencies: string[],
    first: boolean
  ) => {
    return await new Promise<T>((resolve, reject) => {
      const item = {
        fn,
        resolve,
        reject,
        dependencies,
        timestamp: Date.now(),
      }
      if (first) {
        fnQueue.unshift(item)
      } else {
        fnQueue.push(item)
      }
      run()
    })
  }

  const enqueueFn = async <T>(fn: () => Promise<T>, dependencies: string[]) => {
    return await enqueuePrivate(fn, dependencies, false)
  }

  const enqueueFnFirst = async <T>(
    fn: () => Promise<T>,
    dependencies: string[]
  ) => {
    return await enqueuePrivate(fn, dependencies, true)
  }

  const spliceExpiredItems = (queue: typeof fnQueue) => {
    // Queue is sorted with oldest first.
    // Find the first item that has not expired, and splice everything before it.
    const now = Date.now()
    const expiredBeforeIndex = queue.findIndex(
      (item) => now - item.timestamp < timeout
    )
    const expiredCount =
      expiredBeforeIndex === -1 ? queue.length : expiredBeforeIndex
    const expiredItems = queue.splice(0, expiredCount)
    return expiredItems
  }

  const runItem = async (item: WorkItem) => {
    const { fn, resolve, reject } = item

    activeItems.push(item)

    try {
      const result = await fn()
      resolve(result)
    } catch (e) {
      reject(e)
    } finally {
      remove(activeItems, (i) => i === item)
      run()
    }
  }

  const run = () => {
    const expiredItems = spliceExpiredItems(fnQueue)
    for (const item of expiredItems) {
      item.reject(
        new APIError(
          503,
          `High volume of requests (${fnQueue.length} requests in queue); please try again later.`
        )
      )
    }

    const cumulativeDependencies = new Set<string>(
      activeItems.flatMap((item) => item.dependencies)
    )
    const toRun = []
    for (const item of fnQueue) {
      const { dependencies } = item
      if (!dependencies.some((d) => cumulativeDependencies.has(d))) {
        toRun.push(item)
      }
      dependencies.forEach((d) => cumulativeDependencies.add(d))
    }

    const runSet = new Set(toRun)
    remove(fnQueue, (item) => runSet.has(item))

    for (const item of toRun) {
      runItem(item)
    }
  }

  return { enqueueFn, enqueueFnFirst }
}

export const betsQueue = createFnQueue()
export const pollQueue = createFnQueue()
