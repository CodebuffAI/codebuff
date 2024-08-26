import { useEffect } from 'react'
import { useStateCheckEquality } from './use-state-check-equality'
import { useHasLoaded } from './use-has-loaded'

export type PersistenceOptions<T> = { key: string; store: PersistentStore<T> }

export interface PersistentStore<T> {
  get: (k: string) => T | undefined
  set: (k: string, v: T | undefined) => void
}

export const historyStore = <T>(prefix = '__manifold'): PersistentStore<T> => ({
  get: (k: string) => {
    if (typeof window !== 'undefined') {
      return window.history.state?.options?.[prefix]?.[k] as T | undefined
    } else {
      return undefined
    }
  },
  set: (k: string, v: T | undefined) => {
    if (typeof window !== 'undefined') {
      const state = window.history.state ?? {}
      const options = state.options ?? {}
      const inner = options[prefix] ?? {}
      window.history.replaceState(
        {
          ...state,
          options: { ...options, [prefix]: { ...inner, [k]: v } },
        },
        ''
      )
    }
  },
})

const store: Record<string, any> = {}

export const inMemoryStore = <T>(): PersistentStore<T> => ({
  get: (k: string) => {
    return store[k]
  },
  set: (k: string, v: T | undefined) => {
    store[k] = v
  },
})

/** @deprecated  - use usePersistentLocalState or write new hook */
export const usePersistentState = <T>(
  initial: T,
  persist?: PersistenceOptions<T>
) => {
  const store = persist?.store
  const key = persist?.key
  const hasLoaded = useHasLoaded()

  // Note that it's important in some cases to get the state correct during the
  // first render, or scroll restoration won't take into account the saved state.
  // However, if this is the first server render, we don't want to read from the store,
  // because it could cause a hydration error.
  const savedValue =
    hasLoaded && key != null && store != null ? store.get(key) : undefined

  const [state, setState] = useStateCheckEquality(savedValue ?? initial)
  useEffect(() => {
    if (hasLoaded && key != null && store != null) {
      store.set(key, state)
    }
  }, [key, state, hasLoaded])

  return [state, setState] as const
}
