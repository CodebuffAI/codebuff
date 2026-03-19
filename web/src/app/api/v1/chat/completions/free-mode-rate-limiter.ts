/**
 * In-memory rate limiter for FREE mode requests.
 *
 * Enforces multiple fixed-window limits per user to prevent abuse.
 * Each window is anchored to the user's first request in that window
 * and resets once the window duration elapses.
 *
 * Adjust the constants below to tune the limits.
 */

// ---------------------------------------------------------------------------
// Configurable rate-limit constants
// ---------------------------------------------------------------------------

export const FREE_MODE_RATE_LIMITS = {
  /** Max requests per 1-second window */
  PER_SECOND: 2,
  /** Max requests per 1-minute window */
  PER_MINUTE: 20,
  /** Max requests per 30-minute window */
  PER_30_MINUTES: 200,
  /** Max requests per 5-hour window */
  PER_5_HOURS: 1_000,
  /** Max requests per 7-day window */
  PER_7_DAYS: 10_000,
} as const

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RateWindow {
  name: string
  windowMs: number
  maxRequests: number
}

interface WindowTracker {
  count: number
  windowStart: number
}

export type RateLimitResult = {
  limited: false
} | {
  limited: true
  windowName: string
  retryAfterMs: number
}

// ---------------------------------------------------------------------------
// Window definitions (derived from the constants above)
// ---------------------------------------------------------------------------

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const RATE_WINDOWS: RateWindow[] = [
  { name: '1 second',    windowMs: 1 * SECOND_MS,  maxRequests: FREE_MODE_RATE_LIMITS.PER_SECOND },
  { name: '1 minute',    windowMs: 1 * MINUTE_MS,  maxRequests: FREE_MODE_RATE_LIMITS.PER_MINUTE },
  { name: '30 minutes',  windowMs: 30 * MINUTE_MS, maxRequests: FREE_MODE_RATE_LIMITS.PER_30_MINUTES },
  { name: '5 hours',     windowMs: 5 * HOUR_MS,    maxRequests: FREE_MODE_RATE_LIMITS.PER_5_HOURS },
  { name: '7 days',      windowMs: 7 * DAY_MS,     maxRequests: FREE_MODE_RATE_LIMITS.PER_7_DAYS },
]

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

// userId -> (windowName -> tracker)
const userWindows = new Map<string, Map<string, WindowTracker>>()

let lastCleanupTime = 0
const CLEANUP_INTERVAL_MS = 5 * MINUTE_MS

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

function cleanupExpiredEntries(): void {
  const now = Date.now()
  for (const [userId, windows] of userWindows) {
    for (const [windowName, tracker] of windows) {
      const matchingWindow = RATE_WINDOWS.find((w) => w.name === windowName)
      if (!matchingWindow) {
        windows.delete(windowName)
        continue
      }
      if (now - tracker.windowStart >= matchingWindow.windowMs) {
        windows.delete(windowName)
      }
    }
    if (windows.size === 0) {
      userWindows.delete(userId)
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Check whether a free-mode request from `userId` should be rate-limited.
 *
 * If the request is allowed, each window's counter is incremented.
 * If any window is exceeded, the request is rejected and no counters change.
 */
export function checkFreeModeRateLimit(userId: string): RateLimitResult {
  const now = Date.now()

  // Periodic cleanup to prevent memory leaks
  if (now - lastCleanupTime > CLEANUP_INTERVAL_MS) {
    cleanupExpiredEntries()
    lastCleanupTime = now
  }

  let windows = userWindows.get(userId)
  if (!windows) {
    windows = new Map()
    userWindows.set(userId, windows)
  }

  // First pass: check all windows without mutating
  for (const rateWindow of RATE_WINDOWS) {
    let tracker = windows.get(rateWindow.name)

    // Reset the window if it has expired
    if (tracker && now - tracker.windowStart >= rateWindow.windowMs) {
      windows.delete(rateWindow.name)
      tracker = undefined
    }

    const currentCount = tracker?.count ?? 0
    if (currentCount >= rateWindow.maxRequests) {
      const windowStart = tracker!.windowStart
      const retryAfterMs = rateWindow.windowMs - (now - windowStart)
      return {
        limited: true,
        windowName: rateWindow.name,
        retryAfterMs: Math.max(0, retryAfterMs),
      }
    }
  }

  // Second pass: increment all window counters (request is allowed)
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

/**
 * Reset all rate-limit state. Exposed for testing.
 */
export function resetFreeModeRateLimits(): void {
  userWindows.clear()
  lastCleanupTime = 0
}
