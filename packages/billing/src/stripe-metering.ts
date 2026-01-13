import { withRetry, withTimeout } from '@codebuff/common/util/promise'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'

const STRIPE_METER_EVENT_NAME = 'credits'
const STRIPE_METER_REQUEST_TIMEOUT_MS = 10_000

function shouldAttemptStripeMetering(): boolean {
  // Avoid sending Stripe metering events in CI or when Stripe isn't configured.
  // Evals set CI=true to skip billing.
  if (process.env.CI === 'true' || process.env.CI === '1') return false
  return Boolean(process.env.STRIPE_SECRET_KEY)
}

export async function reportPurchasedCreditsToStripe(params: {
  userId: string
  stripeCustomerId?: string | null
  purchasedCredits: number
  logger: Logger
  /**
   * Optional unique identifier used for Stripe idempotency + debugging.
   * For message-based usage, pass the message ID.
   */
  eventId?: string
  /**
   * Optional timestamp for the usage event.
   * Defaults to "now".
   */
  timestamp?: Date
  /**
   * Optional additional payload fields (must be strings).
   */
  extraPayload?: Record<string, string>
}): Promise<void> {
  const {
    userId,
    stripeCustomerId: providedStripeCustomerId,
    purchasedCredits,
    logger,
    eventId,
    timestamp = new Date(),
    extraPayload,
  } = params

  if (purchasedCredits <= 0) return
  if (!shouldAttemptStripeMetering()) return

  const logContext = { userId, purchasedCredits, eventId }

  let stripeCustomerId = providedStripeCustomerId
  if (stripeCustomerId === undefined) {
    let user: { stripe_customer_id: string | null } | undefined
    try {
      user = await db.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: { stripe_customer_id: true },
      })
    } catch (error) {
      logger.error(
        { ...logContext, error },
        'Failed to fetch user for Stripe metering',
      )
      return
    }

    stripeCustomerId = user?.stripe_customer_id ?? null
  }
  if (!stripeCustomerId) {
    logger.warn(logContext, 'Skipping Stripe metering (missing stripe_customer_id)')
    return
  }

  const stripeTimestamp = Math.floor(timestamp.getTime() / 1000)
  const idempotencyKey = eventId ? `meter-${eventId}` : undefined

  try {
    await withTimeout(
      withRetry(
        () =>
          stripeServer.billing.meterEvents.create(
            {
              event_name: STRIPE_METER_EVENT_NAME,
              timestamp: stripeTimestamp,
              payload: {
                stripe_customer_id: stripeCustomerId,
                value: purchasedCredits.toString(),
                ...(eventId ? { event_id: eventId } : {}),
                ...(extraPayload ?? {}),
              },
            },
            idempotencyKey ? { idempotencyKey } : undefined,
          ),
        {
          maxRetries: 3,
          retryIf: (error: unknown) => {
            const stripeError = error as { type?: string } | null
            return (
              stripeError?.type === 'StripeConnectionError' ||
              stripeError?.type === 'StripeAPIError' ||
              stripeError?.type === 'StripeRateLimitError'
            )
          },
          onRetry: (error: unknown, attempt: number) => {
            logger.warn(
              { ...logContext, attempt, error },
              'Retrying Stripe metering call',
            )
          },
          retryDelayMs: 500,
        },
      ),
      STRIPE_METER_REQUEST_TIMEOUT_MS,
      `Stripe metering timed out after ${STRIPE_METER_REQUEST_TIMEOUT_MS}ms`,
    )
  } catch (error) {
    logger.error({ ...logContext, error }, 'Failed to report purchased credits to Stripe')
  }
}
