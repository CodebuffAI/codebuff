'use client'

import { useEffect, useState } from 'react'

import type { FreebuffLiveStats } from '@/server/live-stats'

const POLL_MS = 60_000
const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

export const EMPTY_LIVE_STATS: FreebuffLiveStats = {
  totalLiveUsers: 0,
  countries: [],
  models: [],
  generatedAt: '1970-01-01T00:00:00.000Z',
}

export function countryName(code: string): string {
  if (code === 'UNKNOWN') {
    return 'Unknown'
  }

  return /^[A-Z]{2}$/.test(code) ? (REGION_NAMES.of(code) ?? code) : code
}

export function useLiveStats(
  initialStats: FreebuffLiveStats,
  options: {
    enabled?: boolean
    pauseWhenHidden?: boolean
    refreshOnMount?: boolean
  } = {},
) {
  const {
    enabled = true,
    pauseWhenHidden = false,
    refreshOnMount = false,
  } = options
  const [stats, setStats] = useState(initialStats)

  useEffect(() => {
    if (!enabled) {
      return
    }

    let isMounted = true

    async function refresh() {
      if (pauseWhenHidden && document.visibilityState === 'hidden') {
        return
      }

      try {
        const response = await fetch('/api/live', { cache: 'no-store' })
        if (response.ok && isMounted) {
          setStats((await response.json()) as FreebuffLiveStats)
        }
      } catch {
        // Keep the previous snapshot if a transient refresh fails.
      }
    }

    if (refreshOnMount) {
      void refresh()
    }

    const interval = window.setInterval(refresh, POLL_MS)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void refresh()
      }
    }

    if (pauseWhenHidden) {
      document.addEventListener('visibilitychange', refreshWhenVisible)
    }

    return () => {
      isMounted = false
      window.clearInterval(interval)
      if (pauseWhenHidden) {
        document.removeEventListener('visibilitychange', refreshWhenVisible)
      }
    }
  }, [enabled, pauseWhenHidden, refreshOnMount])

  return stats
}
