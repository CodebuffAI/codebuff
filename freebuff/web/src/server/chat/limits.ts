import { recordUsageAndCount } from './store'

const DAILY_MESSAGE_LIMIT = 200
const PER_MINUTE_MESSAGE_LIMIT = 15

const MINUTE_MS = 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

export interface RateLimitResult {
  allowed: boolean
  message?: string
}

/**
 * Records this attempt in the append-only usage ledger, then checks both
 * windows. Counts include the attempt itself, so concurrent requests see
 * each other and the limits hold under burst; rejected attempts still
 * consume quota, which is intentional (hammering the limit doesn't pay).
 */
export async function consumeChatRateLimit(
  userId: string,
): Promise<RateLimitResult> {
  const now = Date.now()
  const { shortWindow, longWindow } = await recordUsageAndCount({
    userId,
    shortWindowStart: new Date(now - MINUTE_MS),
    longWindowStart: new Date(now - DAY_MS),
  })
  if (shortWindow > PER_MINUTE_MESSAGE_LIMIT) {
    return {
      allowed: false,
      message:
        'You are sending messages too quickly. Wait a minute and try again.',
    }
  }
  if (longWindow > DAILY_MESSAGE_LIMIT) {
    return {
      allowed: false,
      message: `You've hit the free limit of ${DAILY_MESSAGE_LIMIT} messages per day. Come back tomorrow!`,
    }
  }
  return { allowed: true }
}
