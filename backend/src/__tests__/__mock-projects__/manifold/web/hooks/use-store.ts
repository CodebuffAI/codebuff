import { Dictionary, isEqual } from 'lodash'
import { useEffect } from 'react'
import { useEffectCheckEquality } from './use-effect-check-equality'
import { useEvent } from './use-event'
import { useForceUpdate } from './use-force-update'

const store: Dictionary<any> = {}
const storeListeners: Dictionary<((data: any) => void)[]> = {}
const storeUnsubscribes: Dictionary<() => void> = {}

const updateValue = (key: string, value: any) => {
  if (isEqual(store[key], value)) return

  store[key] = value
  storeListeners[key]?.forEach((l) => l(value))
}

const addListener = <T>(
  prefix: string,
  key: string,
  listenForValue: (key: string, setValue: (value: T) => void) => () => void,
  onUpdate: (data: any) => void
) => {
  const keyWithPrefix = prefix + key

  if (!storeUnsubscribes[keyWithPrefix]) {
    const unsubscribe = listenForValue(key, (value) =>
      updateValue(keyWithPrefix, value)
    )
    storeUnsubscribes[keyWithPrefix] = unsubscribe
  }

  if (!storeListeners[keyWithPrefix]) storeListeners[keyWithPrefix] = []
  storeListeners[keyWithPrefix].push(onUpdate)
}

const removeListener = (key: string, onUpdate: (data: any) => void) => {
  storeListeners[key] = storeListeners[key].filter((l) => l !== onUpdate)

  if (storeListeners[key].length === 0 && storeUnsubscribes[key]) {
    storeUnsubscribes[key]()
    delete storeUnsubscribes[key]
  }
}

export const useStore = <T>(
  key: string | undefined,
  listenForValue: (key: string, setValue: (value: T) => void) => () => void,
  options: {
    prefix?: string
  } = {}
) => {
  const { prefix = '' } = options
  const keyWithPrefix = prefix + key

  const forceUpdate = useForceUpdate()
  const subscribe = useEvent(listenForValue)

  useEffect(() => {
    if (key === undefined) return
    addListener(prefix, key, subscribe, forceUpdate)

    return () => {
      removeListener(keyWithPrefix, forceUpdate)
    }
  }, [prefix, key, keyWithPrefix, forceUpdate, subscribe])

  if (key === undefined) return undefined

  return store[keyWithPrefix] as T | undefined
}

export const useStoreItems = <T>(
  keys: string[],
  listenForValue: (key: string, setValue: (value: T) => void) => () => void,
  options: {
    prefix?: string
    loadOnce?: boolean
  } = {}
) => {
  const { prefix = '', loadOnce = false } = options

  const forceUpdate = useForceUpdate()
  const subscribe = useEvent(listenForValue)

  useEffectCheckEquality(() => {
    let hasLoaded = false
    const listeners = keys.map(
      (key) =>
        [
          key,
          () => {
            // Update after all have loaded, and on every subsequent update.
            if (
              keys.every((key) => store[prefix + key] !== undefined) &&
              !(loadOnce && hasLoaded)
            ) {
              forceUpdate()
              hasLoaded = true
            }
          },
        ] as const
    )
    for (const [key, onUpdate] of listeners) {
      addListener(prefix, key, subscribe, onUpdate)
    }
    return () => {
      for (const [key, listener] of listeners) {
        removeListener(prefix + key, listener)
      }
    }
  }, [keys, forceUpdate, subscribe])

  return keys.map((key) => store[prefix + key] as T | undefined)
}
