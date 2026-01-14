import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
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
import { getErrorObject } from '@codebuff/common/util/error'
import { buildArray } from '@codebuff/common/util/array'

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
})

const bodySchema = z.object({
  messages: z.array(messageSchema),
  sessionId: z.string().optional(),
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

  // Parse and validate request body
  let messages: z.infer<typeof bodySchema>['messages']
  let sessionId: string | undefined
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
  try {
    const requestBody = {
      messages: filteredMessages,
      userId,
      ...(sessionId ? { sessionId } : {}),
      user: {
        email: userInfo.email,
      },
      testAd: serverEnv.CB_ENVIRONMENT !== 'prod',
    }
    // Call Gravity API
    const response = await fetch('https://server.trygravity.ai/ad', {
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
      return NextResponse.json({ ad: null }, { status: 200 })
    }

    // Now safe to parse JSON body
    const ad = await response.json()

    if (!response.ok) {
      logger.error(
        { request: requestBody, response: ad, status: response.status },
        '[ads] Gravity API returned error',
      )
      return NextResponse.json({ ad: null }, { status: 200 })
    }

    logger.info(
      {
        ad,
        request: requestBody,
        status: response.status,
      },
      '[ads] Fetched ad from Gravity API',
    )

    // Insert ad_impression row to database (served_at = now)
    // This stores the trusted ad data server-side so we don't have to trust the client later
    try {
      await db.insert(schema.adImpression).values({
        user_id: userId,
        ad_text: ad.adText,
        title: ad.title,
        cta: ad.cta,
        url: ad.url,
        favicon: ad.favicon,
        click_url: ad.clickUrl,
        imp_url: ad.impUrl,
        payout: String(ad.payout),
        credits_granted: 0, // Will be updated when impression is fired
      })

      logger.info(
        { userId, impUrl: ad.impUrl, status: response.status },
        '[ads] Created ad_impression record for served ad',
      )
    } catch (error) {
      // If insert fails (e.g., duplicate impUrl), log but continue
      // The ad can still be shown, it just won't be tracked
      logger.warn(
        {
          userId,
          impUrl: ad.impUrl,
          status: response.status,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error,
        },
        '[ads] Failed to create ad_impression record (likely duplicate)',
      )
    }

    // Return ad to client without payout (credits will come from impression endpoint)
    const { payout: _payout, ...adWithoutPayout } = ad
    return NextResponse.json({ ad: adWithoutPayout })
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
      { ad: null, error: getErrorObject(error) },
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
