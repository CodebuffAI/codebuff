/**
 * Rate limiter for FREE mode requests.
 *
 * Enforces multiple fixed-window limits per user to prevent abuse.
 * Each window is anchored to the user's first request in that window
 * and resets once the window duration elapses.
 *
 * Production can use a Redis-compatible store such as Render Key Value via
 * `checkConfiguredFreeModeRateLimit`. The in-memory implementation remains
 * the dev/test fallback.
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
  PER_MINUTE: 25,
  /** Max requests per 30-minute window */
  PER_30_MINUTES: 250,
  /** Max requests per 5-hour window */
  PER_5_HOURS: 2_000,
  /** Max requests per 1-day window */
  PER_DAY: 4_000,
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

interface RedisRateLimitClient {
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>
}

export type RateLimitResult =
  | {
      limited: false
    }
  | {
      limited: true
      windowName: string
      retryAfterMs: number
    }

export interface ConfiguredRateLimitOptions {
  redisUrl?: string | null
  redisClient?: RedisRateLimitClient
}

// ---------------------------------------------------------------------------
// Window definitions (derived from the constants above)
// ---------------------------------------------------------------------------

const SECOND_MS = 1000
const MINUTE_MS = 60 * SECOND_MS
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

const RATE_WINDOWS: RateWindow[] = [
  {
    name: '1 second',
    windowMs: 1 * SECOND_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_SECOND,
  },
  {
    name: '1 minute',
    windowMs: 1 * MINUTE_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_MINUTE,
  },
  {
    name: '30 minutes',
    windowMs: 30 * MINUTE_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_30_MINUTES,
  },
  {
    name: '5 hours',
    windowMs: 5 * HOUR_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_5_HOURS,
  },
  {
    name: '1 day',
    windowMs: 1 * DAY_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_DAY,
  },
]

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

// userId -> (windowName -> tracker)
const userWindows = new Map<string, Map<string, WindowTracker>>()

let lastCleanupTime = 0
const CLEANUP_INTERVAL_MS = 5 * MINUTE_MS

// ---------------------------------------------------------------------------
// Redis state
// ---------------------------------------------------------------------------

const REDIS_KEY_PREFIX = 'free-mode-rate-limit:v1'

const REDIS_RATE_LIMIT_SCRIPT = `
local window_count = tonumber(ARGV[1])

for i = 1, window_count do
  local argv_offset = 2 + ((i - 1) * 3)
  local window_name = ARGV[argv_offset]
  local window_ms = tonumber(ARGV[argv_offset + 1])
  local max_requests = tonumber(ARGV[argv_offset + 2])
  local current_count = tonumber(redis.call('GET', KEYS[i]) or '0')

  if current_count >= max_requests then
    local ttl = redis.call('PTTL', KEYS[i])
    if ttl < 0 then
      ttl = window_ms
    end
    return {1, window_name, ttl}
  end
end

for i = 1, window_count do
  local argv_offset = 2 + ((i - 1) * 3)
  local window_ms = tonumber(ARGV[argv_offset + 1])
  local count = redis.call('INCR', KEYS[i])
  local ttl = redis.call('PTTL', KEYS[i])

  if count == 1 or ttl < 0 then
    redis.call('PEXPIRE', KEYS[i], window_ms)
  end
end

return {0}
`

let redisClientPromise: Promise<RedisRateLimitClient> | null = null
let redisClientUrl: string | null = null

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
// Redis helpers
// ---------------------------------------------------------------------------

async function createRedisClient(
  redisUrl: string,
): Promise<RedisRateLimitClient> {
  const { default: Redis } = await import('ioredis')
  const client = new Redis(redisUrl, {
    enableOfflineQueue: false,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
  })

  client.on('error', () => {
    // The request path falls back to the in-memory limiter if Redis is down.
  })

  await client.connect()
  return client
}

async function getRedisClient(redisUrl: string): Promise<RedisRateLimitClient> {
  if (!redisClientPromise || redisClientUrl !== redisUrl) {
    redisClientUrl = redisUrl
    redisClientPromise = createRedisClient(redisUrl).catch((error) => {
      if (redisClientUrl === redisUrl) {
        redisClientPromise = null
        redisClientUrl = null
      }
      throw error
    })
  }

  return redisClientPromise
}

function resetRedisClientForUrl(redisUrl: string): void {
  if (redisClientUrl === redisUrl) {
    redisClientPromise = null
    redisClientUrl = null
  }
}

function getRedisKey(userId: string, rateWindow: RateWindow): string {
  return `${REDIS_KEY_PREFIX}:${encodeURIComponent(userId)}:${rateWindow.windowMs}`
}

function parseRedisRateLimitResult(result: unknown): RateLimitResult {
  if (!Array.isArray(result) || Number(result[0]) !== 1) {
    return { limited: false }
  }

  return {
    limited: true,
    windowName: String(result[1]),
    retryAfterMs: Math.max(0, Number(result[2]) || 0),
  }
}

export async function checkRedisFreeModeRateLimit(
  userId: string,
  redis: RedisRateLimitClient,
): Promise<RateLimitResult> {
  const keys = RATE_WINDOWS.map((rateWindow) => getRedisKey(userId, rateWindow))
  const args = RATE_WINDOWS.flatMap((rateWindow) => [
    rateWindow.name,
    rateWindow.windowMs,
    rateWindow.maxRequests,
  ])

  const result = await redis.eval(
    REDIS_RATE_LIMIT_SCRIPT,
    keys.length,
    ...keys,
    String(RATE_WINDOWS.length),
    ...args,
  )

  return parseRedisRateLimitResult(result)
}

export async function checkConfiguredFreeModeRateLimit(
  userId: string,
  options: ConfiguredRateLimitOptions = {},
): Promise<RateLimitResult> {
  try {
    const redis = options.redisClient
      ? options.redisClient
      : options.redisUrl
        ? await getRedisClient(options.redisUrl)
        : null

    if (!redis) {
      return checkFreeModeRateLimit(userId)
    }

    return await checkRedisFreeModeRateLimit(userId, redis)
  } catch {
    if (options.redisUrl && !options.redisClient) {
      resetRedisClientForUrl(options.redisUrl)
    }
    return checkFreeModeRateLimit(userId)
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
