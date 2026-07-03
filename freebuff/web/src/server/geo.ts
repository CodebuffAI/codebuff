import { env } from '@codebuff/internal/env'
import {
  extractClientIp,
  getCachedFreeModeCountryAccess,
  hashClientIp,
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
  /**
   * The pipeline's own client_ip_hash — the exact value written to
   * free_mode_country_access_cache for this request, so callers recording
   * referral signals can't drift from the table the sock check joins against.
   */
  clientIpHash: string | null
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

/**
 * The request's client_ip_hash — same extraction and HMAC secret as the
 * free-session / country-access pipeline, so the value joins against
 * `free_session.client_ip_hash` and `free_mode_country_access_cache`.
 * Null when no client IP header is present (e.g. local dev).
 */
export function clientIpHashFromHeaders(headers: Headers): string | null {
  return hashClientIp(extractClientIp({ headers }), env.NEXTAUTH_SECRET)
}

function tierFromAccess(access: FreeModeCountryAccess): FreebuffWebAccessTier {
  if (shouldHardBlockFreeModeAccess(access)) return 'blocked'
  return access.allowed ? 'full' : 'limited'
}

/**
 * Resolves the Freebuff Web access tier for a request. Same decision
 * pipeline (and same Postgres cache) as the CLI free-session gate: Cloudflare
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
      clientIpHash: access.clientIpHash,
    }
  } catch (error) {
    logger.warn(
      { userId: params.userId, error },
      'Freebuff web geo access resolution failed; defaulting to full tier',
    )
    return { accessTier: 'full', countryCode: null, clientIpHash: null }
  }
}
