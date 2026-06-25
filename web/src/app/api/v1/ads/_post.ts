import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { NextResponse } from 'next/server'
import { z } from 'zod'

import { requireUserFromApiKey } from '../_helpers'

import { createCarbonProvider } from '@/lib/ad-providers/carbon'
import { createGravityProvider } from '@/lib/ad-providers/gravity'
import { AD_SURFACES } from '@/lib/ad-providers/types'

import type {
  AdProvider,
  AdProviderId,
  AdSurface,
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

const gravityContextSchema = z.record(z.string(), z.unknown())

const providerSchema = z.enum(['gravity', 'carbon']).default('gravity')
const surfaceSchema = z.enum(AD_SURFACES)

const bodySchema = z.object({
  provider: providerSchema.optional(),
  messages: z.array(messageSchema).optional().default([]),
  sessionId: z.string().optional(),
  device: deviceSchema.optional(),
  gravity_context: gravityContextSchema.optional(),
  surface: surfaceSchema.optional(),
  placementId: z.string().optional(),
  /** Browser-like useragent passed through to providers that require it. */
  userAgent: z.string().optional(),
})

export type AdsEnv = {
  GRAVITY_API_KEY: string
  CARBON_ZONE_KEY?: string
  CB_ENVIRONMENT: string
}

function noAdsResponse(provider: AdProviderId) {
  return NextResponse.json({ ads: [], provider }, { status: 200 })
}

const providerFallbacks: Record<AdProviderId, AdProviderId[]> = {
  gravity: ['gravity', 'carbon'],
  carbon: ['carbon'],
}

/**
 * Gravity requires that no other network's ads appear during chat. Chat
 * surfaces (the CLI agent chat — the only caller that omits `surface` — and
 * the web chat surfaces) are gravity-exclusive: no fill -> no ads, and the
 * client keeps showing its cached ad or none. Only the waiting room keeps
 * the fallback chain.
 */
function getProvidersToTry(
  providerId: AdProviderId,
  surface: AdSurface | undefined,
): AdProviderId[] {
  if (surface !== 'waiting_room') return ['gravity']
  return providerFallbacks[providerId]
}

function createConfiguredProvider(
  providerId: AdProviderId,
  serverEnv: AdsEnv,
  logger: Logger,
): AdProvider | null {
  switch (providerId) {
    case 'carbon':
      if (!serverEnv.CARBON_ZONE_KEY) {
        logger.warn('[ads] CARBON_ZONE_KEY not configured')
        return null
      }
      return createCarbonProvider({ zoneKey: serverEnv.CARBON_ZONE_KEY })
    case 'gravity':
      if (!serverEnv.GRAVITY_API_KEY) {
        logger.warn('[ads] GRAVITY_API_KEY not configured')
        return null
      }
      return createGravityProvider({ apiKey: serverEnv.GRAVITY_API_KEY })
  }
}

async function persistAdImpressions(params: {
  ads: NormalizedAd[]
  providerId: AdProviderId
  userId: string
  logger: Logger
}) {
  const { ads, providerId, userId, logger } = params

  try {
    await Promise.all(
      ads.map((ad) =>
        db
          .insert(schema.adImpression)
          .values({
            user_id: userId,
            provider: providerId,
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
        provider: providerId,
        adCount: ads.length,
        error:
          dbError instanceof Error
            ? { name: dbError.name, message: dbError.message }
            : dbError,
      },
      '[ads] Failed to persist ad_impression rows, serving anyway',
    )
  }
}

function toClientAd(ad: NormalizedAd) {
  const { payout: _p, extraPixels: _e, ...rest } = ad
  return rest
}

function getClientIp(req: NextRequest): string | undefined {
  const forwardedFor =
    req.headers.get('x-forwarded-for') ??
    req.headers.get('x-vercel-forwarded-for')
  const forwardedIp = forwardedFor?.split(',')[0]?.trim()
  return (
    forwardedIp ||
    req.headers.get('cf-connecting-ip') ||
    req.headers.get('x-real-ip') ||
    undefined
  )
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

  // Client IP comes in via the load balancer or Freebuff's proxy headers. Every
  // provider that targets or bills by IP (Gravity, Carbon, ...) needs this.
  const clientIp = getClientIp(req)

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
  const requestUserAgent = req.headers.get('user-agent') ?? undefined

  for (const providerToTry of getProvidersToTry(
    providerId,
    parsedBody.surface,
  )) {
    const provider = createConfiguredProvider(providerToTry, serverEnv, logger)
    if (!provider) continue

    try {
      const result = await provider.fetchAd({
        userId,
        userEmail: userInfo.email ?? null,
        sessionId: parsedBody.sessionId,
        clientIp,
        userAgent,
        requestUserAgent,
        device: parsedBody.device,
        gravityContext: parsedBody.gravity_context,
        surface: parsedBody.surface,
        placementId: parsedBody.placementId,
        messages: parsedBody.messages,
        testMode: serverEnv.CB_ENVIRONMENT !== 'prod',
        logger,
        fetch,
      })

      if (!result) {
        logger.debug(
          { provider: provider.id },
          '[ads] Provider returned no fill',
        )
        continue
      }

      await persistAdImpressions({
        ads: result.ads,
        providerId: provider.id,
        userId,
        logger,
      })

      logger.info(
        { provider: provider.id, adCount: result.ads.length },
        '[ads] Fetched ads',
      )
      return NextResponse.json({
        ads: result.ads.map(toClientAd),
        provider: provider.id,
      })
    } catch (error) {
      logger.error(
        {
          userId,
          provider: provider.id,
          error:
            error instanceof Error
              ? { name: error.name, message: error.message }
              : error,
        },
        '[ads] Failed to fetch ad',
      )
    }
  }

  logger.debug(
    { requestedProvider: providerId },
    '[ads] No configured provider returned an ad',
  )
  return noAdsResponse(providerId)
}
