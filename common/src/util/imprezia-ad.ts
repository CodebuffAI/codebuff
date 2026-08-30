import { z } from 'zod'

/**
 * Imprezia Chat Ads API (https://imprezia.ai).
 *
 * Docs: https://demo.imprezia.ai/docs?platform=web (Chat Ads API — REST,
 * server-to-server).
 *
 * Key facts:
 * - POST {base}/v1/ads/chat, authenticated with the publisher key in the
 *   `X-API-Key` header. Server-to-server only — the key must never reach the
 *   browser.
 * - The key prefix selects the environment: `api_pub_sandbox_` keys talk to
 *   api-sandbox.imprezia.ai, `api_pub_prod_` keys to api.imprezia.ai. We key
 *   off the prefix rather than NODE_ENV so a sandbox key deployed to prod
 *   still cannot bill live advertisers.
 * - One call per completed chat turn; it takes both the user message and the
 *   finished assistant reply. Returns `{ requestId, ad }` with `ad: null` on
 *   no-fill. Ads are single-use: never cached or replayed across turns.
 * - Billing runs on two browser-fired beacons (see buildBeaconPayload). An ad
 *   that never reports the viewable beacon is never counted or paid.
 *
 * This module is isomorphic and lives in `common` because three callers share
 * it: the freebuff web chat route, its browser renderer, and the ad-provider
 * used by the CLI/Desktop auction endpoint. It pulls in nothing server-only.
 */

/** Version label we report as `sdkVersion` on every beacon. */
const IMPREZIA_INTEGRATION_VERSION = 'freebuff-web/1.0.0'

export const IMPREZIA_SANDBOX_BASE_URL = 'https://api-sandbox.imprezia.ai'
export const IMPREZIA_PROD_BASE_URL = 'https://api.imprezia.ai'

const SANDBOX_KEY_PREFIX = 'api_pub_sandbox_'

/**
 * Field limits from the request contract. We clamp to these rather than
 * rejecting: a 60k-character assistant reply is a normal chat turn, and
 * dropping the whole ad call over it would just be lost revenue.
 */
export const IMPREZIA_LIMITS = {
  request: 10_000,
  response: 50_000,
  sessionId: 100,
} as const

/**
 * Pick the API base URL from the key prefix. Sandbox keys must never hit the
 * production endpoint (and vice versa) — the key is the source of truth for
 * which environment we are in.
 */
export function impreziaBaseUrlForKey(apiKey: string): string {
  return apiKey.startsWith(SANDBOX_KEY_PREFIX)
    ? IMPREZIA_SANDBOX_BASE_URL
    : IMPREZIA_PROD_BASE_URL
}

/**
 * Sandbox keys serve real-looking *test* creatives (Imprezia's own house ad),
 * which must never reach production users. The key prefix keeps us off the
 * production ledger; this keeps test inventory off the production site. Both
 * ad routes refuse to serve when this is true in prod.
 */
export function isImpreziaSandboxKey(apiKey: string): boolean {
  return apiKey.startsWith(SANDBOX_KEY_PREFIX)
}

const impreziaDeviceTypeSchema = z.enum(['desktop', 'mobile', 'tablet'])

export type ImpreziaDeviceType = z.infer<typeof impreziaDeviceTypeSchema>

export const impreziaDeviceContextSchema = z.object({
  deviceType: impreziaDeviceTypeSchema,
  viewportWidth: z.number().int().positive(),
  viewportHeight: z.number().int().positive(),
})

export type ImpreziaDeviceContext = z.infer<typeof impreziaDeviceContextSchema>

/**
 * Third-party measurement attached by the demand partners funding the ad.
 * Delivering it is not optional — undelivered measurement means the
 * advertiser never counts the impression.
 *
 * Each of the two moments (insertion, MRC50) arrives in exactly one of two
 * channels: a URL array to fire as pixels, or a frame URL to embed as a
 * hidden iframe. A presence check on the frame field picks correctly and
 * cannot double-count.
 */
const impreziaTrackersSchema = z.object({
  impression: z.array(z.string()).optional(),
  mrc50: z.array(z.string()).optional(),
  impressionFrameUrl: z.string().optional(),
  viewabilityFrameUrl: z.string().optional(),
})

export type ImpreziaTrackers = z.infer<typeof impreziaTrackersSchema>

/** Shared with the display API, which issues the same signed token. */
export const impreziaBeaconTokenSchema = z.object({
  token: z.string(),
  issuedAt: z.number(),
  kid: z.string(),
})

const impreziaImpressionSchema = z.object({
  impressionUuid: z.string(),
  beaconToken: impreziaBeaconTokenSchema.optional(),
  servedAt: z.string(),
  publisherId: z.string(),
})

const impreziaCreativeSchema = z.object({
  brandName: z.string(),
  title: z.string(),
  description: z.string(),
  cta: z.string(),
  // Not always present. When they ARE present, rendering them is required.
  logoUrl: z.string().optional(),
  imageUrl: z.string().optional(),
})

export const impreziaAdSchema = z.object({
  creative: impreziaCreativeSchema,
  clickUrl: z.string(),
  trackers: impreziaTrackersSchema.optional(),
  impression: impreziaImpressionSchema,
})

export type ImpreziaAd = z.infer<typeof impreziaAdSchema>

/** Shape of a 200 from POST /v1/ads/chat. `ad` is null on no-fill. */
export const impreziaChatAdResponseSchema = z.object({
  requestId: z.string(),
  ad: impreziaAdSchema.nullable().optional(),
})

/**
 * What our own API route hands the browser: the decision plus the base URL
 * the client should post beacons to. The API key is deliberately absent — the
 * beacon endpoint is unauthenticated, so the browser never needs it.
 */
export type ImpreziaDecision = {
  requestId: string
  ad: ImpreziaAd
  baseUrl: string
}

/**
 * The two beacon event types, spelled exactly as the API expects.
 *
 * These strings are load-bearing: a beacon whose eventType is missing or
 * unrecognized is counted as `sdk_impression` (the billable viewable
 * impression), so a typo in `sdk_impression_inserted` silently reports a
 * viewable impression that was never viewable. Always reference these
 * constants rather than writing the literals at call sites.
 */
export const IMPREZIA_EVENT_INSERTED = 'sdk_impression_inserted' as const
export const IMPREZIA_EVENT_VIEWABLE = 'sdk_impression' as const

export type ImpreziaEventType =
  | typeof IMPREZIA_EVENT_INSERTED
  | typeof IMPREZIA_EVENT_VIEWABLE

export const IMPREZIA_BEACON_PATH = '/v1/events/sdk-impression'

/**
 * Build the beacon body. Every value the API gave us is echoed back exactly
 * as received — `impressionUuid`, the three `beaconToken` fields, `servedAt`
 * as `serverTimestamp`, and `clickUrl` as `generatedUrl`. When `beaconToken`
 * is absent the three token fields are omitted entirely rather than sent as
 * null/undefined.
 */
export function buildBeaconPayload(params: {
  // Structural, not `ImpreziaDecision`: the server-side path reconstitutes
  // only the handful of fields a beacon echoes (see ImpreziaBeaconRecord)
  // rather than storing an entire creative it already has in table columns.
  decision: {
    requestId: string
    ad: Pick<ImpreziaAd, 'clickUrl' | 'impression'>
  }
  eventType: ImpreziaEventType
  sessionId: string
  eventId: string
  clientTimestamp: string
}): Record<string, unknown> {
  const { decision, eventType, sessionId, eventId, clientTimestamp } = params
  const { requestId, ad } = decision
  const token = ad.impression.beaconToken

  return {
    eventId,
    eventType,
    requestId,
    sdkVersion: IMPREZIA_INTEGRATION_VERSION,
    clientTimestamp,
    serverTimestamp: ad.impression.servedAt,
    generatedUrl: ad.clickUrl,
    impressionUuid: ad.impression.impressionUuid,
    ...(token
      ? {
          impressionToken: token.token,
          tokenIssuedAt: token.issuedAt,
          tokenKid: token.kid,
        }
      : {}),
    placementType: 'uicard',
    publisherId: ad.impression.publisherId,
    sessionId,
  }
}

/**
 * `sourceUrl` must be the page origin + path only. Strip any query string or
 * fragment rather than trusting the caller, since the chat URL carries thread
 * ids we have no reason to hand an ad network.
 */
export function normalizeSourceUrl(raw: string): string | null {
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

/**
 * Classify the end user's device for `deviceContext.deviceType`.
 *
 * Width alone is not enough — a desktop browser dragged narrow is still a
 * desktop, and a tablet in portrait is not a phone — so the touch capability
 * and the UA both get a say. Pure and parameterised so the branches are
 * testable without a DOM.
 */
export function detectDeviceType(params: {
  userAgent: string
  width: number
  maxTouchPoints: number
}): ImpreziaDeviceType {
  const { userAgent, width, maxTouchPoints } = params
  const ua = userAgent.toLowerCase()
  const isTouch = maxTouchPoints > 0

  // iPadOS reports a desktop UA, so the touch check is what catches it.
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet'
  if (ua.includes('mobi') || ua.includes('iphone') || ua.includes('android')) {
    // Android tablets say "Android" but omit "Mobi".
    return ua.includes('android') && !ua.includes('mobi') ? 'tablet' : 'mobile'
  }
  if (isTouch && width >= 600 && width < 1024) return 'tablet'
  if (isTouch && width < 600) return 'mobile'
  return 'desktop'
}

/**
 * The minimum an Imprezia impression needs to be reported LATER, from a
 * different process than the one that won the auction.
 *
 * The browser path never needs this — it holds the decision in memory and
 * beacons from the page. The CLI and Desktop do: they auction on our server,
 * render in a terminal, then call back to say "shown", by which point the
 * signed token has to still exist somewhere. It is stored on the impression
 * row (`ad_impression.provider_meta`) rather than handed to the client,
 * because that endpoint deliberately trusts only server-side state.
 *
 * Deliberately excludes the creative: title, description, cta, click url and
 * favicon are already their own columns on that row, and duplicating them
 * into a JSON blob on a table this large is pure cost.
 */
export type ImpreziaBeaconRecord = {
  /** Environment-correct API base, resolved from the key prefix at auction. */
  baseUrl: string
  requestId: string
  sessionId: string
  /** Echoed back as `generatedUrl`. */
  clickUrl: string
  impression: ImpreziaAd['impression']
}

/** Parse a stored {@link ImpreziaBeaconRecord}, or null if it is unusable. */
export function parseImpreziaBeaconRecord(
  raw: string | null | undefined,
): ImpreziaBeaconRecord | null {
  if (!raw) return null
  try {
    const parsed = impreziaBeaconRecordSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

const impreziaBeaconRecordSchema = z.object({
  baseUrl: z.string(),
  requestId: z.string(),
  sessionId: z.string(),
  clickUrl: z.string(),
  impression: impreziaImpressionSchema,
})

/**
 * Host for the synthesized `ad_impression.imp_url`. Imprezia has no impression
 * pixel, but that column is NOT NULL UNIQUE and is the key every downstream
 * lookup uses, so a serve needs one. `.invalid` is reserved by RFC 2606 and
 * never resolves, so a stray fetch fails loudly instead of hitting something
 * real.
 */
const IMPREZIA_IMP_URL_PREFIX = 'https://impression.imprezia.invalid/'

/** Stable per-impression identity for the `imp_url` column. */
export function impreziaImpressionUrl(impressionUuid: string): string {
  return `${IMPREZIA_IMP_URL_PREFIX}${impressionUuid}`
}

/**
 * Map an Imprezia decision onto impression-row fields.
 *
 * Two callers serve Imprezia — the CLI/Desktop ad provider and the web chat
 * route — and they reach it by completely different paths. This exists so they
 * cannot drift on HOW a serve is recorded: the same creative mapping, the same
 * synthesized imp_url, the same beacon record. A row written by one has to be
 * indistinguishable from a row written by the other, or the arm comparison is
 * comparing bookkeeping instead of ads.
 */
export function impreziaImpressionFields(params: {
  ad: ImpreziaAd
  requestId: string
  sessionId: string
  baseUrl: string
}) {
  const { ad, requestId, sessionId, baseUrl } = params

  const beacon: ImpreziaBeaconRecord = {
    baseUrl,
    requestId,
    sessionId,
    clickUrl: ad.clickUrl,
    impression: ad.impression,
  }

  return {
    adText: ad.creative.description,
    title: ad.creative.title,
    cta: ad.creative.cta,
    // Imprezia returns one tracked click URL and no landing page, and its
    // destination is an opaque token, so there is no advertiser domain to
    // show. Empty like Carbon's `statlink`, so renderers name no destination
    // rather than the ad network. Clicks still go through `clickUrl`.
    url: '',
    clickUrl: ad.clickUrl,
    favicon: ad.creative.logoUrl ?? '',
    impUrl: impreziaImpressionUrl(ad.impression.impressionUuid),
    providerMeta: JSON.stringify(beacon),
  }
}
