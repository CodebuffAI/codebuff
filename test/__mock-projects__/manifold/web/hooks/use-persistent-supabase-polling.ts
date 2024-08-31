import { useCallback, useEffect, useRef, useState } from 'react'

type PollingState =
  | { state: 'waiting'; version: number; timeout?: undefined }
  | { state: 'polling'; version: number; timeout: NodeJS.Timeout }
  | { state: 'error'; version: number; timeout?: NodeJS.Timeout }

export function useLiveUpdates<T>(
  getRows: () => Promise<T>,
  opts?: {
    frequency?: number
    listen?: boolean
    keys?: any[]
  }
) {
  const { frequency = 500, listen = true, keys = [] } = opts ?? {}

  const state = useRef<PollingState>({ state: 'waiting', version: 0 })

  const [results, setResults] = useState<T | undefined>(undefined)
  const [ms, setMs] = useState(frequency)

  const fetchRows = useCallback(() => {
    const version = state.current.version
    getRows()
      .then((r) => {
        setMs(frequency)
        if (state.current.version == version) {
          setResults(r)
          if (listen) {
            state.current = {
              state: 'polling',
              version,
              timeout: setTimeout(fetchRows, ms),
            }
          }
        }
      })
      .catch((e) => {
        console.error(e)

        // exponential backoff
        setMs((ms) => Math.min(ms ** 1.2, 30_000))

        state.current = {
          state: 'error',
          version,
          timeout: setTimeout(fetchRows, ms),
        }
      })
  }, [listen, ...keys])

  useEffect(() => {
    if (listen) fetchRows()
    return () => {
      if (state.current.timeout != null) {
        clearTimeout(state.current.timeout)
      }
      state.current = { state: 'waiting', version: state.current.version + 1 }
    }
  }, [listen, ...keys])

  return results
}
