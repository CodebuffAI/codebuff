import { trackEvent } from '@codebuff/common/analytics'

import { logger } from '@/util/logger'

import type { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

/**
 * Emit one server-side analytics event from the freebuff-web service to BOTH
 * sinks: PostHog (`trackEvent`, prod-gated, distinct_id = the canonical
 * Postgres user id) and the Axiom `freebuff` dataset (the freebuff-web
 * `logger` dual-write, which promotes `eventId` → the top-level `event`
 * column and `userId` → `user_id`; see docs/logging.md).
 *
 * Why two explicit legs: `trackEvent` reaches PostHog only, and unlike the
 * codebuff `web` service's logger (web/src/util/logger.ts, which auto-
 * dispatches eventId-tagged log rows to PostHog via analytics-dispatcher),
 * the freebuff-web logger only does the Axiom half. Do NOT add that
 * dispatcher here or fold the logger call into `trackEvent` without removing
 * the other leg — either change would double-count events in PostHog.
 */
export function trackServerEvent({
  event,
  userId,
  properties,
}: {
  event: AnalyticsEvent
  userId: string
  properties?: Record<string, unknown>
}): void {
  trackEvent({ event, userId, properties, logger })
  logger.info({ ...properties, eventId: event, userId }, event)
}
