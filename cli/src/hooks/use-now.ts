import { useEffect, useState } from 'react'

/**
 * Returns `Date.now()`, refreshed at the given interval. Pass `enabled: false`
 * to freeze the timer (and cancel the interval). Multiple components can call
 * this independently; setIntervals are cheap and React batches the resulting
 * renders.
 *
 * Intended for short-lived UI countdowns like the freebuff session timer or
 * elapsed-in-queue display.
 */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, enabled])
  return now
}
