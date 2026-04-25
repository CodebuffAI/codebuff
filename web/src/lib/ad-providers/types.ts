import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Identifies which upstream ad network served an ad. Stored on
 * `ad_impression.provider` so we can slice analytics and know which request
 * shape to expect when firing impressions. Add a new id here when wiring in
 * another provider (e.g. 'zeroclick').
 */
export type AdProviderId = 'gravity' | 'carbon'

export type AdVariant = 'banner' | 'choice'

/**
 * Normalized ad shape returned by every provider. The CLI renders against
 * this shape; provider modules are responsible for mapping their upstream
 * response into it.
 */
export type NormalizedAd = {
  adText: string
  title: string
  cta: string
  url: string
  favicon: string
  clickUrl: string
  /** Primary impression pixel URL. Fired once when the ad becomes visible. */
  impUrl: string
  /**
   * Additional impression pixels (e.g. Carbon's `pixel` field). Each string
   * may contain `[timestamp]` which must be substituted at fire time.
   */
  extraPixels?: string[]
  /** Server-only: stripped before the ad is sent to the client. */
  payout?: number
}

export type AdMessage = { role: string; content: string }

export type AdDeviceInfo = {
  os?: 'macos' | 'windows' | 'linux'
  timezone?: string
  locale?: string
}

export type AdSurface = 'waiting_room'

export type FetchAdInput = {
  userId: string
  userEmail: string | null
  sessionId?: string
  /** Client IP, parsed from X-Forwarded-For upstream. */
  clientIp?: string
  /** Browser/CLI useragent string, passed through to upstream. */
  userAgent?: string
  device?: AdDeviceInfo
  /** Product surface requesting the ad. Providers may map this to placements. */
  surface?: AdSurface
  /** Last user + last preceding assistant message, if any. Used by Gravity. */
  messages?: AdMessage[]
  /** Set in non-prod so providers can request test ads. */
  testMode: boolean
  logger: Logger
  fetch: typeof globalThis.fetch
}

export type FetchAdResult =
  | { variant: 'banner'; ad: NormalizedAd }
  | { variant: 'choice'; ads: NormalizedAd[] }
  | null

export type AdProvider = {
  id: AdProviderId
  fetchAd: (input: FetchAdInput) => Promise<FetchAdResult>
}
