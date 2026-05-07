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
 * - A single zone request returns one ad. To populate the choice ad panel we
 *   issue multiple concurrent requests and dedupe by description — Carbon
 *   rotates through its fill pool per-request, so repeated calls usually yield
 *   different creatives.
 */
const CARBON_URL_BASE = 'https://srv.buysellads.com/ads'

// How many concurrent zone fetches to issue when filling the choice panel.
// Four matches the Gravity choice layout and gives enough headroom that
// dedupe still leaves us multiple distinct ads on typical fill rates.
const CARBON_CHOICE_FETCH_COUNT = 4

type CarbonAd = {
  statlink?: string
  statimp?: string
  statview?: string
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

function normalizeCarbonAd(raw: CarbonAd): NormalizedAd | null {
  // Per Carbon docs: if `statlink` is missing the zone had no fill.
  if (!raw.statlink || !raw.statimp) return null

  const clickUrl = withScheme(raw.statlink)
  const impUrl = withScheme(raw.statimp)

  // `statview` is Carbon's IAB viewable-impression pixel (separate from the
  // regular impression `statimp`). Our CLI ad is definitively viewable when
  // rendered, so fire it alongside any advertiser pixels.
  const extraPixels = [
    ...(raw.statview ? [withScheme(raw.statview)] : []),
    ...splitPixels(raw.pixel),
  ]

  return {
    adText: raw.description ?? '',
    title: raw.company ?? '',
    cta: raw.callToAction ?? 'Learn more',
    // Carbon doesn't expose a destination URL — `statlink` is a tracker
    // that 302s to the advertiser. Leave `url` empty so the UI doesn't
    // render "srv.buysellads.com" as the ad's domain. Clicks use
    // `clickUrl` and get correctly routed through tracking.
    url: '',
    favicon: raw.image ?? raw.logo ?? '',
    clickUrl,
    impUrl,
    extraPixels,
  }
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

      const fetchOne = async (): Promise<NormalizedAd | null> => {
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
        if (!first) return null
        return normalizeCarbonAd(first)
      }

      const results = await Promise.all(
        Array.from({ length: CARBON_CHOICE_FETCH_COUNT }, fetchOne),
      )

      // Dedupe by description — Carbon issues a fresh tracker URL per request
      // even for the same creative, so clickUrl/impUrl can't serve as a
      // stable identity key.
      const seen = new Set<string>()
      const ads: NormalizedAd[] = []
      for (const ad of results) {
        if (!ad) continue
        const key = ad.adText || ad.title
        if (!key || seen.has(key)) continue
        seen.add(key)
        ads.push(ad)
      }

      if (ads.length === 0) {
        logger.debug({ url }, '[ads:carbon] No ad fill')
        return null
      }

      return { ads }
    },
  }
}
