import { withRetry, withTimeout } from '@codebuff/common/util/promise'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { stripeServer } from '@codebuff/internal/util/stripe'
import { eq } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { BillingDbConnection } from '@codebuff/common/types/contracts/billing'

const STRIPE_METER_EVENT_NAME = 'credits'
const STRIPE_METER_REQUEST_TIMEOUT_MS = 10_000

/**
 * Dependencies for reportPurchasedCreditsToStripe (for testing)
 */
export interface ReportPurchasedCreditsToStripeDeps {
  db?: BillingDbConnection
  stripeServer?: typeof stripeServer
  shouldAttemptStripeMetering?: () => boolean
}

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
  /**
   * Optional dependencies for testing.
   */
  deps?: ReportPurchasedCreditsToStripeDeps
}): Promise<void> {
  const {
    userId,
    stripeCustomerId: providedStripeCustomerId,
    purchasedCredits,
    logger,
    eventId,
    timestamp = new Date(),
    extraPayload,
    deps = {},
  } = params

  const dbClient = deps.db ?? db
  const stripe = deps.stripeServer ?? stripeServer
  const checkShouldAttempt = deps.shouldAttemptStripeMetering ?? shouldAttemptStripeMetering

  if (purchasedCredits <= 0) return
  if (!checkShouldAttempt()) return

  const logContext = { userId, purchasedCredits, eventId }

  let stripeCustomerId = providedStripeCustomerId
  if (stripeCustomerId === undefined) {
    try {
      const user = await dbClient.query.user.findFirst({
        where: eq(schema.user.id, userId),
        columns: { stripe_customer_id: true },
      })
      stripeCustomerId = user?.stripe_customer_id ?? null
    } catch (error) {
      logger.error(
        { ...logContext, error },
        'Failed to fetch user for Stripe metering',
      )
      return
    }
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
          stripe.billing.meterEvents.create(
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
