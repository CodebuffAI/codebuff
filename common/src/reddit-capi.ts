import { createHash } from 'node:crypto'

import { IS_PROD } from '@codebuff/common/env'
import { extractClientIp } from '@codebuff/common/util/rate-limit'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  RedditFirstPromptCapiEventName,
  RedditRetentionCapiEventName,
} from '@codebuff/common/util/reddit-capi-events'

export type { RedditFirstPromptCapiEventName, RedditRetentionCapiEventName }

/** Reddit Ads pixel ID (public, also used for CAPI endpoint). */
export const REDDIT_PIXEL_ID = 'a2_j6o59svbxzzn'

const REDDIT_CAPI_ENDPOINT = `https://ads-api.reddit.com/api/v3/pixels/${REDDIT_PIXEL_ID}/conversion_events`

export type RedditActionSource = 'WEBSITE' | 'APP' | 'PHYSICAL_STORE' | 'OTHER'

export type RedditCapiUser = {
  email?: string | null
  externalId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
  clickId?: string | null
  uuid?: string | null
}

export type RedditCapiCustomEvent =
  | RedditFirstPromptCapiEventName
  | RedditRetentionCapiEventName

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function buildUserPayload(user: RedditCapiUser) {
  const payload: Record<string, string> = {}

  if (user.email) {
    payload.email = sha256(normalizeEmail(user.email))
  }
  if (user.externalId) {
    payload.external_id = sha256(user.externalId.trim())
  }
  if (user.ipAddress) {
    payload.ip_address = user.ipAddress
  }
  if (user.userAgent) {
    payload.user_agent = user.userAgent
  }
  if (user.clickId) {
    payload.click_id = user.clickId
  }
  if (user.uuid) {
    payload.uuid = user.uuid
  }

  return Object.keys(payload).length > 0 ? payload : undefined
}

export type SendRedditCustomConversionParams = {
  /** Conversion access token from Reddit Events Manager (env-provided; no-op when unset). */
  accessToken: string | undefined
  customEventName: RedditCapiCustomEvent
  conversionId: string
  actionSource: RedditActionSource
  eventSourceUrl?: string
  user: RedditCapiUser
  fetchImpl?: typeof fetch
  logger?: Logger
}

/** Fire-and-forget Reddit Conversions API custom event. Never throws. */
export async function sendRedditCustomConversion(
  params: SendRedditCustomConversionParams,
): Promise<void> {
  if (!IS_PROD || !params.accessToken) {
    return
  }

  const fetchImpl = params.fetchImpl ?? fetch
  const eventAt = Date.now()
  const user = buildUserPayload(params.user)

  const body = {
    data: {
      events: [
        {
          event_at: eventAt,
          action_source: params.actionSource,
          ...(params.eventSourceUrl
            ? { event_source_url: params.eventSourceUrl }
            : {}),
          type: {
            tracking_type: 'CUSTOM',
            custom_event_name: params.customEventName,
          },
          ...(params.user.clickId ? { click_id: params.user.clickId } : {}),
          metadata: {
            conversion_id: params.conversionId,
          },
          ...(user ? { user } : {}),
        },
      ],
      partner: 'FREEBUFF',
      partner_version: '1.0.0',
    },
  }

  try {
    const response = await fetchImpl(REDDIT_CAPI_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': 'freebuff/1.0 (reddit-capi)',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(3_000),
    })
    if (!response.ok) {
      params.logger?.warn(
        {
          status: response.status,
          responseBody: (await response.text().catch(() => '')).slice(0, 500),
          customEventName: params.customEventName,
          conversionId: params.conversionId,
        },
        'Reddit CAPI rejected conversion event',
      )
    }
  } catch (error) {
    // Best-effort ad attribution; never block product flows.
    params.logger?.warn(
      {
        error,
        customEventName: params.customEventName,
        conversionId: params.conversionId,
      },
      'Reddit CAPI conversion request failed',
    )
  }
}

export function redditConversionId(
  event: RedditCapiCustomEvent,
  userId: string,
  suffix?: string,
): string {
  return [event.toLowerCase(), userId, suffix ?? String(Date.now())].join('_')
}

/**
 * Identity fields shared by every server-side Reddit conversion call, built
 * from the incoming request's headers. Surface-specific attribution (click id,
 * uuid) is layered on by callers that have it.
 */
export function redditUserFromRequestHeaders(params: {
  userId: string
  email?: string | null
  headers: { get(name: string): string | null }
}): RedditCapiUser {
  const ip = extractClientIp(params.headers)
  return {
    email: params.email,
    externalId: params.userId,
    ipAddress: ip === 'unknown' ? undefined : ip,
    userAgent: params.headers.get('user-agent')?.trim() || undefined,
  }
}
