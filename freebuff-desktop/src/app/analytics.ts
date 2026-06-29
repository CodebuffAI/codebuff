/**
 * PostHog analytics for Freebuff Desktop, modeled on the CLI's
 * `cli/src/utils/analytics.ts`. PostHog is the product-analytics source of
 * truth; events are also mirrored into the Axiom logs sink via the log shipper
 * (POST /api/logs) so they're queryable in APL alongside the other surfaces.
 *
 * distinct_id rules (so DAU lines up across cli / web / chat / desktop):
 *   - signed in  → the canonical Freebuff (Postgres) user id, held in memory
 *     (set at init + on login). The same id the CLI/web use, so this app's users
 *     merge with their other-surface activity.
 *   - signed out → a stable per-install anonymous id. On login we `alias()` it
 *     to the real user id so pre-auth events (app_launched, first turns) join
 *     the account instead of orphaning at the top of the funnel.
 *
 * Best-effort throughout: a missing PostHog key, a dev build, or a network
 * error never throws into the app. Like the CLI, events are only actually sent
 * in prod — dev/test builds no-op (or debug-log) so they don't pollute prod.
 */

import { createPostHogClient } from '@codebuff/common/analytics-core'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { env, IS_PROD } from '@codebuff/common/env'
import { shouldTrackAnalyticsEvent } from '@codebuff/common/util/analytics-sampling'
import { shouldMirrorAnalyticsEvent } from '@codebuff/common/util/log-mirror'

import { getAuthUser } from './auth/login-store'
import { enqueueClientLog, flushClientLogs } from './log-shipper'
import { getOrCreateAnalyticsId } from './project-dir'

import type { AnalyticsClientWithIdentify } from '@codebuff/common/analytics-core'

const SURFACE = 'desktop'

let client: AnalyticsClientWithIdentify | undefined
let anonId: string | undefined
// Resolved user id, held in memory (like the CLI) so the per-event distinct-id
// lookup never hits disk. Set at init + on login, cleared on logout.
let currentUserId: string | undefined
const DEBUG = process.env.FREEBUFF_DEBUG_ANALYTICS === 'true'

/** The stable per-install anonymous id (lazily minted + cached). */
function getAnonId(): string {
  if (!anonId) anonId = getOrCreateAnalyticsId()
  return anonId
}

/** Real user id when signed in, else the anonymous id. */
function getDistinctId(): string {
  return currentUserId ?? getAnonId()
}

/**
 * Construct the PostHog client. No-ops (leaving analytics disabled) when the
 * public key/host aren't configured — e.g. a packaged build without them baked
 * in, or local dev. Safe to call more than once.
 */
export function initAnalytics(): void {
  if (client) return
  const apiKey = env.NEXT_PUBLIC_POSTHOG_API_KEY
  const host = env.NEXT_PUBLIC_POSTHOG_HOST_URL
  if (!apiKey || !host) return
  // Seed identity once: anon id for pre-login, plus the user id if already
  // signed in from a previous session (so a relaunch doesn't start anonymous).
  getAnonId()
  currentUserId = getAuthUser()?.id
  try {
    client = createPostHogClient(apiKey, { host, enableExceptionAutocapture: IS_PROD })
  } catch {
    // Disabled gracefully; the app runs fine without analytics.
  }
}

/**
 * Capture one event. `surface: 'desktop'` is stamped on every event so the
 * cross-surface dashboards (DAU from `message_sent`, etc.) can segment by it.
 */
export function trackEvent(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>,
): void {
  const props = { surface: SURFACE, ...properties }
  const distinctId = getDistinctId()

  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log(`[analytics] ${event}`, { distinctId, ...props })
  }

  // Respect the shared sampling rules (same source of truth as the CLI): the
  // desktop events are all in ALWAYS_TRACK, but routing through this keeps the
  // surfaces consistent and honors CODEBUFF_FULL_TELEMETRY.
  if (!shouldTrackAnalyticsEvent({ event, distinctId, properties: props })) return

  // Mirror into Axiom (the shipper has its own prod/env gate). Skip denylisted
  // events (session replay etc.).
  if (shouldMirrorAnalyticsEvent(event)) {
    try {
      enqueueClientLog({
        level: 'info',
        event,
        message: event,
        client_session_id: getAnonId(),
        data: props,
      })
    } catch {
      // Best-effort mirror.
    }
  }

  // Only send to PostHog in prod, so dev/test builds don't pollute prod people.
  if (!client || !IS_PROD) return
  try {
    client.capture({ distinctId, event, properties: props })
  } catch {
    // Never let analytics break a user action.
  }
}

/**
 * Tie the persisted anonymous activity to the real user on sign-in. Aliases the
 * anon id to the user id FIRST (merges histories), then identifies with the
 * user's profile properties. Called by the server when login completes.
 */
export function identifyOnLogin(user: {
  id?: string
  email?: string
  name?: string
}): void {
  if (!user.id) return
  currentUserId = user.id
  if (DEBUG) {
    // eslint-disable-next-line no-console
    console.log('[analytics] identify', user.id)
  }
  if (!client || !IS_PROD) return
  try {
    client.alias({ distinctId: user.id, alias: getAnonId() })
    client.identify({
      distinctId: user.id,
      properties: { email: user.email, name: user.name, freebuff: true, surface: SURFACE },
    })
  } catch {
    // Best-effort.
  }
}

/** Revert to anonymous identity on sign-out so later events aren't attributed
 *  to the previous user. */
export function resetIdentity(): void {
  currentUserId = undefined
}

/** Flush buffered PostHog + Axiom events. Owns draining both telemetry paths so
 *  the server only needs a single shutdown hook. */
export async function flushAnalytics(): Promise<void> {
  try {
    await client?.flush()
  } catch {
    // Best-effort.
  }
  await flushClientLogs()
}
