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
  PER_SECOND: 3,
  /** Max requests per 1-minute window */
  PER_MINUTE: 40,
  /** Max requests per 30-minute window */
  PER_30_MINUTES: 350,
  /** Max requests per 5-hour window */
  PER_5_HOURS: 2_000,
  /** Max requests per 1-day window */
  PER_DAY: 4_000,
} as const

/**
 * Extra per-user caps that apply ONLY to free-mode requests on premium models
 * (DeepSeek V4 Pro, MiMo 2.5 Pro, Kimi K2.6, MiniMax M3).
 *
 * Why this exists: the intended premium allowance is
 * FREEBUFF_PREMIUM_SESSION_LIMIT (5) sessions/Pacific-day, but that cap is only
 * enforced when an `agent_run` is created (triggerGates → rateLimiter). Callers
 * who script the OpenAI-compatible `/v1/chat/completions` endpoint directly
 * never create an agent_run, so they bypass it entirely and hammer premium
 * models for free (observed: thousands of premium calls/day across sock
 * accounts). This cap is checked on EVERY free-mode premium request at the
 * endpoint, independent of the agent-run path, so it cannot be bypassed.
 *
 * Sizing: the intended allowance is 5 premium sessions/Pacific-day, and a user
 * can legitimately spend all 5 in a short burst, so we only cap the daily
 * total (no separate sub-day premium window). Short bursts are still bounded by
 * the general windows above (≤350/30min, ≤2000/5h). PER_DAY is sized so ~5
 * premium coding sessions — root + reviewer/file-picker subagents on premium
 * models, up to a few hundred steps each — stay well under it. Tune to trade
 * off legit power-user headroom vs. how hard abuse is throttled.
 */
export const FREE_MODE_PREMIUM_RATE_LIMITS = {
  /** Max premium-model requests per 1-day window */
  PER_DAY: 1_200,
} as const

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface RateWindow {
  name: string
  /** Stable, unique key used for both the in-memory map slot and the Redis key
   *  suffix. Premium windows use a `premium:`-prefixed key so they never
   *  collide with the general windows that share the same windowMs. */
  key: string
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
  /** When true, also enforce the premium-model windows
   *  (FREE_MODE_PREMIUM_RATE_LIMITS). Set for free-mode requests on premium
   *  models. */
  premium?: boolean
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
    key: String(1 * SECOND_MS),
    windowMs: 1 * SECOND_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_SECOND,
  },
  {
    name: '1 minute',
    key: String(1 * MINUTE_MS),
    windowMs: 1 * MINUTE_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_MINUTE,
  },
  {
    name: '30 minutes',
    key: String(30 * MINUTE_MS),
    windowMs: 30 * MINUTE_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_30_MINUTES,
  },
  {
    name: '5 hours',
    key: String(5 * HOUR_MS),
    windowMs: 5 * HOUR_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_5_HOURS,
  },
  {
    name: '1 day',
    key: String(1 * DAY_MS),
    windowMs: 1 * DAY_MS,
    maxRequests: FREE_MODE_RATE_LIMITS.PER_DAY,
  },
]

/** Premium-only windows, appended to the general windows for premium-model
 *  requests. Distinct `key`/`name` so they get their own counters. */
const PREMIUM_RATE_WINDOWS: RateWindow[] = [
  {
    name: 'premium 1 day',
    key: `premium:${1 * DAY_MS}`,
    windowMs: 1 * DAY_MS,
    maxRequests: FREE_MODE_PREMIUM_RATE_LIMITS.PER_DAY,
  },
]

/** Every window that can appear in a tracker, used for cleanup lookups. */
const ALL_WINDOWS: RateWindow[] = [...RATE_WINDOWS, ...PREMIUM_RATE_WINDOWS]

/** Windows to enforce for a request. Premium requests get the general windows
 *  PLUS the premium windows; non-premium requests get only the general ones. */
function windowsForRequest(premium: boolean): RateWindow[] {
  return premium ? ALL_WINDOWS : RATE_WINDOWS
}

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

// userId -> (window.key -> tracker)
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
    for (const [windowKey, tracker] of windows) {
      const matchingWindow = ALL_WINDOWS.find((w) => w.key === windowKey)
      if (!matchingWindow) {
        windows.delete(windowKey)
        continue
      }
      if (now - tracker.windowStart >= matchingWindow.windowMs) {
        windows.delete(windowKey)
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
  return `${REDIS_KEY_PREFIX}:${encodeURIComponent(userId)}:${rateWindow.key}`
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
  windows: RateWindow[] = RATE_WINDOWS,
): Promise<RateLimitResult> {
  const keys = windows.map((rateWindow) => getRedisKey(userId, rateWindow))
  const args = windows.flatMap((rateWindow) => [
    rateWindow.name,
    rateWindow.windowMs,
    rateWindow.maxRequests,
  ])

  const result = await redis.eval(
    REDIS_RATE_LIMIT_SCRIPT,
    keys.length,
    ...keys,
    String(windows.length),
    ...args,
  )

  return parseRedisRateLimitResult(result)
}

export async function checkConfiguredFreeModeRateLimit(
  userId: string,
  options: ConfiguredRateLimitOptions = {},
): Promise<RateLimitResult> {
  const premium = options.premium ?? false
  try {
    const redis = options.redisClient
      ? options.redisClient
      : options.redisUrl
        ? await getRedisClient(options.redisUrl)
        : null

    if (!redis) {
      return checkFreeModeRateLimit(userId, { premium })
    }

    return await checkRedisFreeModeRateLimit(
      userId,
      redis,
      windowsForRequest(premium),
    )
  } catch {
    if (options.redisUrl && !options.redisClient) {
      resetRedisClientForUrl(options.redisUrl)
    }
    return checkFreeModeRateLimit(userId, { premium })
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
export function checkFreeModeRateLimit(
  userId: string,
  options: { premium?: boolean } = {},
): RateLimitResult {
  const now = Date.now()
  const activeWindows = windowsForRequest(options.premium ?? false)

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
  for (const rateWindow of activeWindows) {
    let tracker = windows.get(rateWindow.key)

    // Reset the window if it has expired
    if (tracker && now - tracker.windowStart >= rateWindow.windowMs) {
      windows.delete(rateWindow.key)
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
  for (const rateWindow of activeWindows) {
    let tracker = windows.get(rateWindow.key)
    if (!tracker) {
      tracker = { count: 0, windowStart: now }
      windows.set(rateWindow.key, tracker)
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
