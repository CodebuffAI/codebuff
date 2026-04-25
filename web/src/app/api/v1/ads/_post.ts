import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { getErrorObject } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserFromApiKey } from '../_helpers'

import { createCarbonProvider } from '@/lib/ad-providers/carbon'
import { createGravityProvider } from '@/lib/ad-providers/gravity'

import type {
  AdProvider,
  AdProviderId,
  NormalizedAd,
} from '@/lib/ad-providers/types'
import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type {
  Logger,
  LoggerWithContextFn,
} from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

const messageSchema = z.object({
  role: z.string(),
  content: z.string(),
})

const deviceSchema = z.object({
  os: z.enum(['macos', 'windows', 'linux']).optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
})

const providerSchema = z.enum(['gravity', 'carbon']).default('gravity')
const surfaceSchema = z.enum(['waiting_room'])

const bodySchema = z.object({
  provider: providerSchema.optional(),
  messages: z.array(messageSchema).optional().default([]),
  sessionId: z.string().optional(),
  device: deviceSchema.optional(),
  surface: surfaceSchema.optional(),
  /** Browser/CLI useragent passed through to providers that require it. */
  userAgent: z.string().optional(),
})

export type AdsEnv = {
  GRAVITY_API_KEY: string
  CARBON_ZONE_KEY?: string
  CB_ENVIRONMENT: string
}

export async function postAds(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  logger: Logger
  loggerWithContext: LoggerWithContextFn
  trackEvent: TrackEventFn
  fetch: typeof globalThis.fetch
  serverEnv: AdsEnv
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

  // Client IP comes in via the load balancer's X-Forwarded-For header. Every
  // provider that targets or bills by IP (Gravity, Carbon, ...) needs this.
  const forwardedFor = req.headers.get('x-forwarded-for')
  const clientIp = forwardedFor
    ? forwardedFor.split(',')[0].trim()
    : (req.headers.get('x-real-ip') ?? undefined)

  let parsedBody: z.infer<typeof bodySchema>
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
    parsedBody = parsed.data
  } catch {
    return NextResponse.json(
      { error: 'Invalid JSON in request body' },
      { status: 400 },
    )
  }

  const providerId: AdProviderId = parsedBody.provider ?? 'gravity'
  const userAgent =
    parsedBody.userAgent ?? req.headers.get('user-agent') ?? undefined

  // Pick a provider. If the requested one isn't configured, return no ad
  // rather than failing — the client falls back to its cache / fallback UI.
  let provider: AdProvider | null = null
  if (providerId === 'carbon') {
    if (!serverEnv.CARBON_ZONE_KEY) {
      logger.warn('[ads] CARBON_ZONE_KEY not configured')
      return NextResponse.json({ ad: null, provider: providerId }, { status: 200 })
    }
    provider = createCarbonProvider({ zoneKey: serverEnv.CARBON_ZONE_KEY })
  } else {
    if (!serverEnv.GRAVITY_API_KEY) {
      logger.warn('[ads] GRAVITY_API_KEY not configured')
      return NextResponse.json({ ad: null, provider: providerId }, { status: 200 })
    }
    provider = createGravityProvider({ apiKey: serverEnv.GRAVITY_API_KEY })
  }

  try {
    const result = await provider.fetchAd({
      userId,
      userEmail: userInfo.email ?? null,
      sessionId: parsedBody.sessionId,
      clientIp,
      userAgent,
      device: parsedBody.device,
      surface: parsedBody.surface,
      messages: parsedBody.messages,
      testMode: serverEnv.CB_ENVIRONMENT !== 'prod',
      logger,
      fetch,
    })

    if (!result) {
      return NextResponse.json(
        { ad: null, provider: provider.id },
        { status: 200 },
      )
    }

    const adsToPersist: NormalizedAd[] =
      result.variant === 'choice' ? result.ads : [result.ad]

    // Persist served ads so the impression endpoint can validate + fire the
    // correct pixels. Any DB failure is logged but doesn't block serving.
    try {
      await Promise.all(
        adsToPersist.map((ad) =>
          db
            .insert(schema.adImpression)
            .values({
              user_id: userId,
              provider: provider.id,
              ad_text: ad.adText,
              title: ad.title,
              cta: ad.cta,
              url: ad.url,
              favicon: ad.favicon,
              click_url: ad.clickUrl,
              imp_url: ad.impUrl,
              extra_pixels: ad.extraPixels ?? null,
              payout: ad.payout != null ? String(ad.payout) : null,
              credits_granted: 0,
            })
            .onConflictDoNothing(),
        ),
      )
    } catch (dbError) {
      logger.warn(
        {
          userId,
          provider: provider.id,
          adCount: adsToPersist.length,
          error:
            dbError instanceof Error
              ? { name: dbError.name, message: dbError.message }
              : dbError,
        },
        '[ads] Failed to persist ad_impression rows, serving anyway',
      )
    }

    // Strip server-only fields before sending to the CLI.
    const toClient = (ad: NormalizedAd) => {
      const { payout: _p, extraPixels: _e, ...rest } = ad
      return rest
    }

    if (result.variant === 'choice') {
      logger.info(
        { provider: provider.id, variant: 'choice', adCount: result.ads.length },
        '[ads] Fetched choice ads',
      )
      return NextResponse.json({
        ads: result.ads.map(toClient),
        variant: 'choice',
        provider: provider.id,
      })
    }

    logger.info(
      { provider: provider.id, variant: 'banner' },
      '[ads] Fetched banner ad',
    )
    return NextResponse.json({
      ad: toClient(result.ad),
      variant: 'banner',
      provider: provider.id,
    })
  } catch (error) {
    logger.error(
      {
        userId,
        provider: providerId,
        error:
          error instanceof Error
            ? { name: error.name, message: error.message }
            : error,
      },
      '[ads] Failed to fetch ad',
    )
    return NextResponse.json(
      {
        ad: null,
        provider: providerId,
        error: getErrorObject(error),
      },
      { status: 500 },
    )
  }
}
