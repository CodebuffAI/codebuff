import { env } from '@codebuff/internal/env'
import {
  getCachedFreeModeCountryAccess,
  shouldHardBlockFreeModeAccess,
} from '@codebuff/internal/free-mode-country'

import { logger } from '@/util/logger'

import type { FreebuffWebAccessTier } from '@codebuff/common/constants/freebuff-models'
import type {
  ClientHintsInput,
  FreeModeCountryAccess,
} from '@codebuff/internal/free-mode-country'

export type FreebuffWebGeoAccess = {
  accessTier: FreebuffWebAccessTier
  countryCode: string | null
}

/** Hint headers attached by the web client to the convex-token fetch. All
 *  values are client-controlled: used only to escalate scrutiny, never to
 *  grant access. */
export function clientHintsFromHeaders(headers: Headers): ClientHintsInput {
  const timezone = headers.get('x-fb-timezone')
  const tzOffsetRaw = headers.get('x-fb-tz-offset')
  const tzOffsetParsed = tzOffsetRaw === null ? NaN : Number(tzOffsetRaw)
  const languagesHeader =
    headers.get('x-fb-languages') ?? headers.get('accept-language')

  return {
    timezone,
    tzOffsetMinutes: Number.isFinite(tzOffsetParsed) ? tzOffsetParsed : null,
    languages: languagesHeader
      ? languagesHeader
          .split(',')
          .map((part) => part.split(';')[0].trim())
          .filter((part) => part.length > 0 && part !== '*')
      : null,
  }
}

function tierFromAccess(access: FreeModeCountryAccess): FreebuffWebAccessTier {
  if (shouldHardBlockFreeModeAccess(access)) return 'blocked'
  return access.allowed ? 'full' : 'limited'
}

/**
 * Resolves the Freebuff Web access tier for a request. Same decision
 * pipeline (and same Postgres cache) as the CLI waiting room: Cloudflare
 * country -> geoip fallback -> allowlist -> IPinfo -> Spur/Scamalytics, plus
 * browser hints as a downgrade-only escalation signal.
 *
 * Fails open to `full` on unexpected errors so a geo-provider outage can
 * never lock everyone out of the app.
 */
export async function resolveFreebuffWebGeoAccess(params: {
  userId: string
  headers: Headers
}): Promise<FreebuffWebGeoAccess> {
  try {
    const access = await getCachedFreeModeCountryAccess({
      userId: params.userId,
      req: { headers: params.headers },
      logger,
      options: {
        ipinfoToken: env.IPINFO_TOKEN,
        spurToken: env.SPUR_TOKEN,
        scamalyticsApiKey: env.SCAMALYTICS_API_KEY,
        ipHashSecret: env.NEXTAUTH_SECRET,
        allowLocalhost: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev',
        clientHints: clientHintsFromHeaders(params.headers),
      },
    })

    return {
      accessTier: tierFromAccess(access),
      countryCode: access.countryCode,
    }
  } catch (error) {
    logger.warn(
      { userId: params.userId, error },
      'Freebuff web geo access resolution failed; defaulting to full tier',
    )
    return { accessTier: 'full', countryCode: null }
  }
}
