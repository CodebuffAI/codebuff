// Simple in-memory rate limiter
const RATE_LIMIT_WINDOW = 60 * 1000 // 1 minute
const MAX_REQUESTS = 5 // 5 requests per minute

interface RateLimit {
  count: number
  resetAt: number
}

const rateLimits = new Map<string, RateLimit>()

export function isRateLimited(userId: string): boolean {
  const now = Date.now()
  const userRateLimit = rateLimits.get(userId)

  // Clean up expired rate limits
  if (userRateLimit && userRateLimit.resetAt < now) {
    rateLimits.delete(userId)
  }

  if (!rateLimits.has(userId)) {
    rateLimits.set(userId, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW,
    })
    return false
  }

  const limit = rateLimits.get(userId)!
  limit.count++

  return limit.count > MAX_REQUESTS
}