const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS

export type ComposioRateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterMs: number; windowName: string }

type RateWindow = {
  name: string
  windowMs: number
  maxRequests: number
}

type WindowTracker = {
  count: number
  windowStart: number
}

const RATE_WINDOWS: RateWindow[] = [
  { name: '1 minute', windowMs: MINUTE_MS, maxRequests: 120 },
  { name: '1 hour', windowMs: HOUR_MS, maxRequests: 1_000 },
]

const userWindows = new Map<string, Map<string, WindowTracker>>()
let lastCleanupTime = 0
const CLEANUP_INTERVAL_MS = 5 * MINUTE_MS

function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [key, windows] of userWindows) {
    for (const [windowName, tracker] of windows) {
      const matchingWindow = RATE_WINDOWS.find((w) => w.name === windowName)
      if (
        !matchingWindow ||
        now - tracker.windowStart >= matchingWindow.windowMs
      ) {
        windows.delete(windowName)
      }
    }
    if (windows.size === 0) {
      userWindows.delete(key)
    }
  }
}

export function checkComposioRateLimit(
  userId: string,
): ComposioRateLimitResult {
  const now = Date.now()
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries()
    lastCleanupTime = now
  }

  const key = userId
  let windows = userWindows.get(key)
  if (!windows) {
    windows = new Map()
    userWindows.set(key, windows)
  }

  // First pass checks every window without mutating counters.
  for (const rateWindow of RATE_WINDOWS) {
    let tracker = windows.get(rateWindow.name)
    if (tracker && now - tracker.windowStart >= rateWindow.windowMs) {
      windows.delete(rateWindow.name)
      tracker = undefined
    }

    if ((tracker?.count ?? 0) >= rateWindow.maxRequests) {
      return {
        limited: true,
        windowName: rateWindow.name,
        retryAfterMs: Math.max(
          0,
          rateWindow.windowMs - (now - tracker!.windowStart),
        ),
      }
    }
  }

  // Second pass increments only allowed requests.
  for (const rateWindow of RATE_WINDOWS) {
    let tracker = windows.get(rateWindow.name)
    if (!tracker) {
      tracker = { count: 0, windowStart: now }
      windows.set(rateWindow.name, tracker)
    }
    tracker.count++
  }

  return { limited: false }
}

export function resetComposioRateLimits(): void {
  userWindows.clear()
  lastCleanupTime = 0
}
