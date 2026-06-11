import { FREEBUFF_FORCE_LIMITED_MODE } from '@codebuff/common/constants/freebuff-models'
import { env } from '@codebuff/internal/env'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type { HeadersCarrier } from '@codebuff/internal/free-mode-country/country-access'

import { logger } from '@/util/logger'

/**
 * Country/privacy tier for the chat product, sharing the freebuff free-mode
 * policy (and its DB cache). 'full' users may pick a model; 'limited' users
 * (unsupported countries, VPN/proxy/datacenter traffic) are pinned to the
 * default model. Fails closed to 'limited' if the check errors.
 */
export async function getChatAccessTier(
  userId: string,
  req: HeadersCarrier,
): Promise<FreebuffAccessTier> {
  try {
    // Loaded lazily so the free-mode policy modules (and their DB schema
    // imports) stay off the module graph until chat actually serves a
    // request.
    const [{ getCachedFreeModeCountryAccess }, { getFreeModeAccessTier }] =
      await Promise.all([
        import('@codebuff/internal/free-mode-country/access-cache'),
        import('@codebuff/internal/free-mode-country/country-access'),
      ])
    const access = await getCachedFreeModeCountryAccess({
      userId,
      req,
      logger,
      options: {
        ipinfoToken: env.IPINFO_TOKEN,
        spurToken: env.SPUR_TOKEN,
        scamalyticsApiKey: env.SCAMALYTICS_API_KEY,
        ipHashSecret: env.NEXTAUTH_SECRET,
        allowLocalhost: env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev',
        forceLimited: FREEBUFF_FORCE_LIMITED_MODE,
      },
    })
    return getFreeModeAccessTier(access)
  } catch (error) {
    logger.error({ error, userId }, 'Chat access tier check failed')
    return 'limited'
  }
}
