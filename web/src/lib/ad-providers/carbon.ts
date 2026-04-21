import type {
  AdProvider,
  FetchAdInput,
  FetchAdResult,
  NormalizedAd,
} from './types'

/**
 * BuySellAds (Carbon) Ad Serving API.
 *
 * Docs: https://docs.buysellads.com/ad-serving-api
 *
 * Key facts:
 * - GET https://srv.buysellads.com/ads/{zonekey}.json
 * - Required query params: `useragent` (URL-encoded) and `forwardedip` (IPv4)
 * - The test zone key `CVADC53U` is public and safe to use while developing.
 * - Response has an `ads` array. An ad is only considered filled if the first
 *   entry has a `statlink` (click URL). `statimp` is the primary impression
 *   pixel. An optional `pixel` field contains additional tracking pixels
 *   separated by `||`, each of which may contain `[timestamp]`.
 */
const CARBON_URL_BASE = 'https://srv.buysellads.com/ads'

type CarbonAd = {
  statlink?: string
  statimp?: string
  description?: string
  company?: string
  callToAction?: string
  image?: string
  logo?: string
  pixel?: string
}

type CarbonResponse = {
  ads?: CarbonAd[]
}

/**
 * Carbon returns `//srv.buysellads.com/...` for its pixel URLs. Normalize to
 * https:// so we (and the CLI) can fetch them directly.
 */
function withScheme(url: string): string {
  if (url.startsWith('//')) return `https:${url}`
  return url
}

function splitPixels(pixel: string | undefined): string[] {
  if (!pixel) return []
  return pixel
    .split('||')
    .map((s) => s.trim())
    .filter(Boolean)
    .map(withScheme)
}

export function createCarbonProvider(config: {
  zoneKey: string
}): AdProvider {
  return {
    id: 'carbon',
    fetchAd: async (input: FetchAdInput): Promise<FetchAdResult> => {
      const { clientIp, userAgent, testMode, logger, fetch } = input

      if (!clientIp || !userAgent) {
        logger.debug(
          { hasIp: !!clientIp, hasUA: !!userAgent },
          '[ads:carbon] Missing required clientIp or userAgent',
        )
        return null
      }

      const params = new URLSearchParams({
        useragent: userAgent,
        forwardedip: clientIp,
      })
      // Carbon's `ignore=yes` loads ads without counting impressions. Use it
      // in non-prod so we never accidentally bill advertisers for dev traffic.
      if (testMode) params.set('ignore', 'yes')

      const url = `${CARBON_URL_BASE}/${config.zoneKey}.json?${params.toString()}`

      const response = await fetch(url, { method: 'GET' })

      if (!response.ok) {
        let body: unknown
        try {
          body = await response.text()
        } catch {
          body = 'Unable to parse error response'
        }
        logger.error(
          { url, status: response.status, body },
          '[ads:carbon] API returned error',
        )
        return null
      }

      const data = (await response.json()) as CarbonResponse
      const first = data.ads?.[0]

      // Per Carbon docs: if `statlink` is missing the zone had no fill.
      if (!first?.statlink || !first.statimp) {
        logger.debug({ url }, '[ads:carbon] No ad fill')
        return null
      }

      const clickUrl = withScheme(first.statlink)
      const impUrl = withScheme(first.statimp)

      const normalized: NormalizedAd = {
        adText: first.description ?? '',
        title: first.company ?? '',
        cta: first.callToAction ?? 'Learn more',
        // Carbon doesn't return a separate destination URL distinct from
        // statlink. Use statlink so DB rows look consistent with Gravity;
        // clients click `clickUrl` in both cases.
        url: clickUrl,
        favicon: first.image ?? first.logo ?? '',
        clickUrl,
        impUrl,
        extraPixels: splitPixels(first.pixel),
      }

      return { variant: 'banner', ad: normalized }
    },
  }
}
