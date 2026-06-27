import { useEffect } from 'react'

import { useStore } from '../store/store'
import type { ServerEvent } from '../lib/types'

/**
 * Single EventSource for all thread-scoped events. Manual exponential-backoff
 * reconnect (EventSource auto-reconnect is unreliable across Electron reloads);
 * the server re-emits state + a thread event per thread on (re)connect, so a
 * dropped connection backfills automatically.
 */
export function useSSE() {
  const applyEvent = useStore((s) => s.applyEvent)
  const setConnection = useStore((s) => s.setConnection)

  useEffect(() => {
    let es: EventSource | null = null
    let closed = false
    let attempt = 0

    const open = () => {
      es = new EventSource('/api/events')
      es.onopen = () => {
        attempt = 0
        setConnection('open')
      }
      es.onmessage = (e) => {
        try {
          applyEvent(JSON.parse(e.data) as ServerEvent)
        } catch {
          /* ignore malformed frame */
        }
      }
      es.onerror = () => {
        if (closed) return
        setConnection('reconnecting')
        es?.close()
        const delay = Math.min(5000, 500 * 2 ** attempt++)
        setTimeout(() => {
          if (!closed) open()
        }, delay)
      }
    }
    open()

    return () => {
      closed = true
      es?.close()
    }
  }, [applyEvent, setConnection])
}
