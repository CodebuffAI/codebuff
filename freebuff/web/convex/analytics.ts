import { v } from 'convex/values'

import { internalAction } from './_generated/server'
import { logToAxiom } from './lib/axiom_log'

// PostHog ingest host. Set POSTHOG_HOST in the Convex deployment env to match
// the rest of the stack; falls back to PostHog US cloud.
const POSTHOG_HOST = (
  process.env.POSTHOG_HOST ??
  process.env.NEXT_PUBLIC_POSTHOG_HOST ??
  'https://us.i.posthog.com'
).replace(/\/$/, '')

// Bound how long a hung PostHog endpoint can hold a (billed) action open.
const CAPTURE_TIMEOUT_MS = 5_000

/**
 * Capture a single analytics event to PostHog from Convex, and mirror it to
 * the Axiom `freebuff` dataset (direct ingest — see lib/axiom_log.ts).
 *
 * The two sends are independent and best-effort: a missing/broken Axiom token
 * costs only Axiom rows, never PostHog DAU, and vice versa. PostHog failures
 * are additionally logged to Axiom at error level so a "web DAU going dark"
 * misconfig is queryable (docs/logging.md conventions), not just buried in
 * Convex stdout.
 *
 * Convex mutations can't do network I/O, so the message-send path schedules
 * this action (runAfter 0) — a metrics failure can never break a send, and the
 * capture runs in its own transaction.
 *
 * `distinctId` must be the canonical codebuff Postgres user id (the JWT subject
 * stored as users.freebuff_user_id), NOT the Convex users `_id`. The browser
 * PostHog SDK identifies web users by their Convex `_id`, so emitting server
 * events under the Postgres id keeps the `message_sent` DAU signal aligned with
 * the cli and chat surfaces, where the distinct id is already the Postgres id.
 *
 * Best-effort: errors are logged and swallowed so they never affect a send.
 */
export const captureEvent = internalAction({
  args: {
    event: v.string(),
    distinctId: v.string(),
    properties: v.optional(v.any()),
  },
  handler: async (_ctx, args) => {
    const reportCaptureFailure = async (detail: Record<string, unknown>) => {
      console.error('[analytics.captureEvent] PostHog capture failed', detail)
      await logToAxiom({
        level: 'error',
        message: `PostHog capture failed for ${args.event}`,
        userId: args.distinctId,
        data: { event: args.event, ...detail },
      })
    }

    const capturePostHog = async () => {
      const apiKey =
        process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY
      if (!apiKey) {
        // No key configured. In production this means the deploy step was
        // missed and web DAU is silently going dark, so surface it loudly;
        // stay quiet in dev/local where the key is expected to be absent.
        if (process.env.NODE_ENV === 'production') {
          await reportCaptureFailure({
            reason:
              'POSTHOG_API_KEY is unset in the Convex deployment env — set it with `npx convex env set`',
          })
        }
        return
      }
      try {
        const res = await fetch(`${POSTHOG_HOST}/capture/`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            api_key: apiKey,
            event: args.event,
            distinct_id: args.distinctId,
            properties: args.properties ?? {},
            timestamp: new Date().toISOString(),
          }),
          ...(typeof AbortSignal.timeout === 'function'
            ? { signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS) }
            : {}),
        })
        if (!res.ok) {
          await reportCaptureFailure({ status: res.status })
        }
      } catch (error) {
        await reportCaptureFailure({
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    await Promise.all([
      capturePostHog(),
      logToAxiom({
        level: 'info',
        message: args.event,
        eventId: args.event,
        userId: args.distinctId,
        data: args.properties,
      }),
    ])
  },
})
