import { v } from 'convex/values'

import { internalAction } from './_generated/server'

// PostHog ingest host. Set POSTHOG_HOST in the Convex deployment env to match
// the rest of the stack; falls back to PostHog US cloud.
const POSTHOG_HOST = (
  process.env.POSTHOG_HOST ??
  process.env.NEXT_PUBLIC_POSTHOG_HOST ??
  'https://us.i.posthog.com'
).replace(/\/$/, '')

/**
 * Capture a single analytics event to PostHog from Convex.
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
    const apiKey =
      process.env.POSTHOG_API_KEY ?? process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!apiKey) {
      // No key configured. In production this means the deploy step was
      // missed and web DAU is silently going dark, so surface it loudly;
      // stay quiet in dev/local where the key is expected to be absent.
      if (process.env.NODE_ENV === 'production') {
        console.error(
          '[analytics.captureEvent] POSTHOG_API_KEY is unset in the Convex deployment env — web message_sent events are being dropped. Set it with `npx convex env set`.',
        )
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
      })
      if (!res.ok) {
        console.error(
          `[analytics.captureEvent] PostHog returned ${res.status} for ${args.event}`,
        )
      }
    } catch (error) {
      console.error('[analytics.captureEvent] capture failed', error)
    }
  },
})
