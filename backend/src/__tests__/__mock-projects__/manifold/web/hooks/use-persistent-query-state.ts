import { useRouter } from 'next/router'
import { useEffect, useState } from 'react'
import { pickBy, debounce } from 'lodash'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'

type UrlParams = Record<string, string | undefined>

// for updating multiple query params
export const usePersistentQueriesState = <T extends UrlParams>(
  defaultValue: T,
  persistPrefix: string
): [T, (newState: Partial<T>) => void, boolean] => {
  const [state, setState] = usePersistentInMemoryState(
    defaultValue,
    `${persistPrefix}-queries-state`
  )

  const router = useRouter()
  const [ready, setReady] = useState(false)

  // On page load, initialize the state to the current query params once.
  useEffect(() => {
    if (router.isReady) {
      setState({ ...defaultValue, ...router.query })
      setReady(true)
    }
  }, [router.isReady])

  const setRouteQuery = debounce((newQuery: string) => {
    const { pathname } = router
    const q = newQuery ? '?' + encodeURI(newQuery) : ''
    router.replace(pathname + q, undefined, { shallow: true })
  }, 200)

  const updateState = (update: Partial<T>) => {
    // Include current query because it might have been updated by another component.
    const newState = { ...state, ...router.query, ...update } as T
    setState(newState)
    const query = pickBy(newState, (v) => v)
    const newQuery = Object.keys(query)
      .map((key) => `${key}=${query[key]}`)
      .join('&')
    setRouteQuery(newQuery)
  }

  return [state, updateState, ready]
}

export const usePersistentQueryState = <K extends string>(
  key: K,
  defaultValue: string
): [string | undefined, (newState: string) => void] => {
  const [state, updateState] = usePersistentQueriesState(
    {
      [key]: defaultValue,
    },
    ''
  )
  return [
    state ? state[key] : undefined,
    (newState: string) => updateState({ [key]: newState }),
  ]
}
