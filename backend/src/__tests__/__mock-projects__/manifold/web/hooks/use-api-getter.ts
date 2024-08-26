import { useEffect } from 'react'

import { APIParams, APIPath, APIResponse } from 'common/api/schema'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { APIError, api } from 'web/lib/api/api'
import { useEvent } from './use-event'

const promiseCache: Record<string, Promise<any> | undefined> = {}

export const useAPIGetter = <P extends APIPath>(
  path: P,
  props: APIParams<P> | undefined,
  ingoreDependencies?: string[],
  overrideKey?: string
) => {
  const propsString = JSON.stringify(props)
  const propsStringToTriggerRefresh = JSON.stringify(
    deepCopyWithoutKeys(props, ingoreDependencies || [])
  )

  const [data, setData] = usePersistentInMemoryState<
    APIResponse<P> | undefined
  >(undefined, `${overrideKey ?? path}`)

  const key = `${path}-${propsString}-error`
  const [error, setError] = usePersistentInMemoryState<APIError | undefined>(
    undefined,
    key
  )

  const refresh = useEvent(async () => {
    if (!props) return

    const cachedPromise = promiseCache[key]
    if (cachedPromise) {
      await cachedPromise.then(setData).catch(setError)
    } else {
      const promise = api(path, props)
      promiseCache[key] = promise
      await promise.then(setData).catch(setError)
      promiseCache[key] = undefined
    }
  })

  useEffect(() => {
    refresh()
  }, [propsStringToTriggerRefresh])

  return { data, error, refresh, setData }
}

function deepCopyWithoutKeys(obj: any, keysToRemove: string[]): any {
  if (Array.isArray(obj)) {
    return obj.map((item) => deepCopyWithoutKeys(item, keysToRemove))
  }

  if (typeof obj === 'object' && obj !== null) {
    const newObj: any = {}
    for (const key in obj) {
      if (!keysToRemove.includes(key)) {
        newObj[key] = deepCopyWithoutKeys(obj[key], keysToRemove)
      }
    }
    return newObj
  }

  return obj
}
