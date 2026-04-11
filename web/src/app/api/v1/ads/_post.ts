import { createHash } from 'crypto'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserFromApiKey } from '../_helpers'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const DEFAULT_PAYOUT = 0.04

// A/B test: 50% of users see the "choice" ad variant (4 ads as bullet points)
type AdVariant = 'banner' | 'choice'

const CHOICE_AD_PLACEMENT_IDS = [
  'choice-ad-1',
  'choice-ad-2',
  'choice-ad-3',
  'choice-ad-4',
]

/**
 * Deterministically assign a user to an ad variant based on their userId.
 * Uses a hash so the assignment is stable across requests.
 */
function getAdVariant(userId: string): AdVariant {
  const hash = createHash('sha256').update(`ad-variant:${userId}`).digest()
  // Use first byte: even = banner, odd = choice (50/50 split)
  return hash[0] % 2 === 0 ? 'banner' : 'choice'
}

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
})

const deviceSchema = z.object({
  os: z.enum(['macos', 'windows', 'linux']).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
})

const bodySchema = z.object({
  messages: z.array(messageSchema),
  sessionId: z.string().optional(),
  device: deviceSchema.optional(),
})

export type GravityEnv = {
  GRAVITY_API_KEY: string
  CB_ENVIRONMENT: string
}

export async function postAds(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
  serverEnv: GravityEnv
}) {
  const {
    req,
    getUserInfoFromApiKey,
    loggerWithContext,
    trackEvent,
    fetch,
    serverEnv,
  } = params

  const authed = await requireUserFromApiKey({
    req,
    getUserInfoFromApiKey,
    logger: params.logger,
    loggerWithContext,
    trackEvent,
    authErrorEvent: AnalyticsEvent.ADS_API_AUTH_ERROR,
  })
  if (!authed.ok) return authed.response

  const { userId, userInfo, logger } = authed.data

  // Check if Gravity API key is configured
  if (!serverEnv.GRAVITY_API_KEY) {
    logger.warn('[ads] GRAVITY_API_KEY not configured')
    return NextResponse.json({ ad: null }, { status: 200 })
  }

  // Extract client IP from request headers
  const forwardedFor = req.headers.get('x-forwarded-for')
  const clientIp = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : (req.headers.get('x-real-ip') ?? undefined)

  // Parse and validate request body
  let messages: z.infer<typeof bodySchema>['messages']
  let sessionId: string | undefined
  let deviceInfo: z.infer<typeof deviceSchema> | undefined
  try {
    const json = await req.json()
    const parsed = bodySchema.safeParse(json)
    if (!parsed.success) {
      logger.error({ parsed, json }, '[ads] Invalid request body')
      return NextResponse.json(
        { error: 'Invalid request body', details: parsed.error.format() },
        { status: 400 },
      )
    }

    // Filter out messages with no content and extract user message content from tags
    messages = parsed.data.messages
      .filter((message) => message.content)
      .map((message) => {
        // For user messages, extract content from the last <user_message> tag if present
        if (message.role === 'user') {
          return {
            ...message,
            content: extractLastUserMessageContent(message.content),
          }
        }
        return message
      })
    sessionId = parsed.data.sessionId
    deviceInfo = parsed.data.device
  } catch {
    logger.error(
      { error: 'Invalid JSON in request body' },
      '[ads] Invalid request body',
    )
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  // Keep just the last user message and the last assistant message before it
  const lastUserMessageIndex = messages.findLastIndex(
    (message) => message.role === 'user',
  )
  const lastUserMessage = messages[lastUserMessageIndex]
  const lastAssistantMessage = messages
    .slice(0, lastUserMessageIndex)
    .findLast((message) => message.role === 'assistant')
  const filteredMessages = buildArray(lastAssistantMessage, lastUserMessage)

  // Build device object for Gravity API
  const device = clientIp
    ? {
      ip: clientIp,
      ...(deviceInfo?.os ? { os: deviceInfo.os } : {}),
      ...(deviceInfo?.timezone ? { timezone: deviceInfo.timezone } : {}),
      ...(deviceInfo?.locale ? { locale: deviceInfo.locale } : {}),
    }
    : undefined

  // Determine A/B test variant for this user
  const variant = getAdVariant(userId)

  // Build placements based on variant
  const placements =
    variant === 'choice'
      ? CHOICE_AD_PLACEMENT_IDS.map((id) => ({
          placement: 'below_response',
          placement_id: id,
        }))
      : [{ placement: 'below_response', placement_id: 'code-assist-ad' }]

  try {
    const requestBody = {
      messages: filteredMessages,
      sessionId: sessionId ?? userId,
      placements,
      testAd: serverEnv.CB_ENVIRONMENT !== 'prod',
      relevancy: 0,
      ...(device ? { device } : {}),
      user: {
        id: userId,
        email: userInfo.email,
      },
    }
    // Call Gravity API
    const response = await fetch('https://server.trygravity.ai/api/v1/ad', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serverEnv.GRAVITY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    })

    // Handle 204 No Content first (no body to parse)
    if (response.status === 204) {
      logger.debug(
        { request: requestBody, status: response.status },
        '[ads] No ad available from Gravity API',
      )
      return NextResponse.json({ ad: null, variant }, { status: 200 })
    }

    // Check response.ok BEFORE parsing JSON to handle HTML error pages gracefully
    if (!response.ok) {
      // Try to get response body for logging, but don't fail if it's not JSON
      let errorBody: unknown
      try {
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.includes('application/json')) {
          errorBody = await response.json()
        } else {
          // Likely an HTML error page from load balancer/CDN
          errorBody = await response.text()
        }
      } catch {
        errorBody = 'Unable to parse error response'
      }
      logger.error(
        { request: requestBody, response: errorBody, status: response.status },
        '[ads] Gravity API returned error',
      )
      return NextResponse.json({ ad: null, variant }, { status: 200 })
    }

    // Now safe to parse JSON body since response.ok is true
    const ads = await response.json()

    if (!Array.isArray(ads) || ads.length === 0) {
      logger.debug(
        { request: requestBody, response: ads, status: response.status },
        '[ads] No ads returned from Gravity API',
      )
      return NextResponse.json({ ad: null, variant }, { status: 200 })
    }

    // Store all returned ads in the database (skip duplicates via imp_url unique constraint)
    // Wrapped in try/catch so DB failures don't prevent serving ads to the client
    try {
      for (const ad of ads) {
        const payout = ad.payout || DEFAULT_PAYOUT
        await db
          .insert(schema.adImpression)
          .values({
            user_id: userId,
            ad_text: ad.adText,
            title: ad.title,
            cta: ad.cta,
            url: ad.url,
            favicon: ad.favicon,
            click_url: ad.clickUrl,
            imp_url: ad.impUrl,
            payout: String(payout),
            credits_granted: 0,
          })
          .onConflictDoNothing()
      }
    } catch (dbError) {
      logger.warn(
        {
          userId,
          adCount: ads.length,
          error:
            dbError instanceof Error
              ? { name: dbError.name, message: dbError.message }
              : dbError,
        },
        '[ads] Failed to persist ad_impression rows, serving ads anyway',
      )
    }

    // Strip payout from all ads before returning to client
    const sanitizeAd = (ad: Record<string, unknown>) => {
      const { payout: _payout, ...rest } = ad
      return rest
    }

    if (variant === 'choice') {
      // Return all ads for the choice variant (up to 4)
      const sanitizedAds = ads.map(sanitizeAd)

      logger.info(
        {
          variant,
          adCount: sanitizedAds.length,
          request: requestBody,
          status: response.status,
        },
        '[ads] Fetched choice ads from Gravity API',
      )

      return NextResponse.json({ ads: sanitizedAds, variant })
    }

    // Banner variant: return single ad (existing behavior)
    const ad = ads[0]
    const payout = ad.payout || DEFAULT_PAYOUT

    logger.info(
      {
        ad,
        variant,
        request: requestBody,
        status: response.status,
        payout: {
          included: ad.payout && ad.payout > 0,
          recieved: ad.payout,
          default: DEFAULT_PAYOUT,
          final: payout,
        },
      },
      '[ads] Fetched ad from Gravity API',
    )

    return NextResponse.json({ ad: sanitizeAd(ad), variant })
  } catch (error) {
    logger.error(
      {
        userId,
        messages,
        status: 500,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      },
      '[ads] Failed to fetch ad from Gravity API',
    )
    return NextResponse.json(
      { ad: null, variant, error: getErrorObject(error) },
      { status: 500 },
    )
  }
}

/**
 * Extract the content from the last <user_message> tag in a string.
 * If no tag is found, returns the original content.
 */
function extractLastUserMessageContent(content: string): string {
  // Find all <user_message>...</user_message> matches
  const regex = /<user_message>([\s\S]*?)<\/user_message>/gi
  const matches = [...content.matchAll(regex)]

  if (matches.length > 0) {
    // Return the content from the last match
    const lastMatch = matches[matches.length - 1]
    return lastMatch[1].trim()
  }

  return content
}
