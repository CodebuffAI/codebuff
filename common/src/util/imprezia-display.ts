import { z } from 'zod'

import { impreziaBeaconTokenSchema } from './imprezia-ad'

/**
 * Imprezia's Display Ads API — the half of their platform that does NOT need a
 * conversation. `/v1/ads/chat` bids on a completed exchange, so a screen with
 * no chat on it can never fill; `/v1/display` takes a slot id and nothing else.
 *
 * Two differences from the chat contract are load-bearing. It is ORIGIN-GATED:
 * without an `Origin` header the API answers 403 `origin_not_allowed`, because
 * it is built for the browser SDK. And the creative arrives nested under
 * `linkData['card-N']` carrying `originalUrl`, the advertiser's real landing
 * page — which the chat API does not return at all, and is why a display ad
 * can name its destination while a chat ad cannot.
 *
 * Undocumented as of 2026-08-26 — their docs mention the Web SDK `display()`
 * method only to say it "does not yet participate in this hierarchy" — so this
 * is written against the live sandbox response. Fields are optional here
 * because they were absent or unverified there, not because we know they are.
 */

/**
 * Sent as `Origin` on every display request.
 *
 * Their allowlist is keyed on the publisher's provisioned sites, and this is
 * the one we are registered under. A request from Desktop has no page and so
 * no real origin of its own; naming our site is what makes it routable rather
 * than a 403.
 */
export const IMPREZIA_DISPLAY_ORIGIN = 'https://freebuff.com'

/** The slot the Desktop new-tab screen bids for. */
export const DESKTOP_NEW_TAB_SLOT_ID = 'freebuff-desktop-new-tab'

export type ImpreziaDisplayRequest = {
  slotId: string
  sessionId?: string
}

const displayCardMetadataSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  brandName: z.string().optional(),
  ctaText: z.string().optional(),
  /**
   * NOT reliably a URL. The sandbox house ad sends the emoji "🎓" here, which
   * would render as a broken image if it reached an <img src>. Callers must
   * use {@link imageSrcOrNull}.
   */
  logoUrl: z.string().optional(),
  adAssetUrl: z.string().optional(),
})

const displayCardSchema = z.object({
  hyperlink: z.string().optional(),
  /** The advertiser's own URL, distinct from the tracked `clickUrl`. */
  originalUrl: z.string().optional(),
  ctaText: z.string().optional(),
  metadata: z.object({
    beaconToken: impreziaBeaconTokenSchema.optional(),
    cardMetadata: displayCardMetadataSchema,
  }),
})

const impreziaDisplayResponseSchema = z.object({
  no_fill: z.boolean().optional(),
  requestId: z.string(),
  publisherId: z.string(),
  impressionUuid: z.string().optional(),
  clickUrl: z.string().optional(),
  /** Keyed `card-0`, `card-1`, … We bid one slot, so we read the first. */
  linkData: z.record(z.string(), displayCardSchema).optional(),
})

export type ImpreziaDisplayAd = {
  title: string
  description: string
  cta: string
  brandName: string
  /** The advertiser's domain-bearing URL, or '' when they sent none. */
  url: string
  /** Always the tracked redirect; this is what a click must go through. */
  clickUrl: string
  imageUrl: string
  logoUrl: string
  impressionUuid: string
  publisherId: string
  beaconToken: { token: string; issuedAt: number; kid: string } | undefined
}

/**
 * An <img src> only accepts a URL. Imprezia's `logoUrl` is a free-text field
 * that may hold an emoji, so anything that is not an http(s) URL is dropped
 * rather than handed to the renderer.
 */
function imageSrcOrNull(value: string | undefined): string {
  if (!value) return ''
  return /^https?:\/\//.test(value) ? value : ''
}

/**
 * Flatten a display response into one ad, or null when nothing filled.
 *
 * Returns null rather than throwing on every malformed shape: this runs on a
 * screen the user is already looking at, and an ad network's response is never
 * worth an error there.
 */
export function toImpreziaDisplayAd(
  raw: unknown,
): { requestId: string; ad: ImpreziaDisplayAd | null } | null {
  const parsed = impreziaDisplayResponseSchema.safeParse(raw)
  if (!parsed.success) return null

  const {
    no_fill,
    requestId,
    publisherId,
    impressionUuid,
    clickUrl,
    linkData,
  } = parsed.data

  const card = linkData ? Object.values(linkData)[0] : undefined
  const click = clickUrl || card?.hyperlink || ''
  if (no_fill || !card || !click || !impressionUuid)
    return { requestId, ad: null }

  const meta = card.metadata.cardMetadata
  return {
    requestId,
    ad: {
      title: meta.title,
      description: meta.description ?? '',
      cta: meta.ctaText || card.ctaText || 'Learn more',
      brandName: meta.brandName ?? '',
      // Unlike chat ads, the advertiser's own URL is available here, so the
      // renderer can name a real destination instead of nothing.
      url: card.originalUrl ?? '',
      clickUrl: click,
      imageUrl: imageSrcOrNull(meta.adAssetUrl),
      logoUrl: imageSrcOrNull(meta.logoUrl),
      impressionUuid,
      publisherId,
      beaconToken: card.metadata.beaconToken,
    },
  }
}

/**
 * What the client echoes back to report a display impression.
 *
 * This is {@link ImpreziaBeaconRecord} minus `baseUrl`, and the omission is
 * the point: the reporting endpoint derives the API base from our own key, so
 * a caller cannot aim our beacon POST at a host of their choosing. Everything
 * that remains is either signed by Imprezia or already public to the client.
 */
export const impreziaDisplayBeaconSchema = z.object({
  requestId: z.string(),
  sessionId: z.string(),
  clickUrl: z.string(),
  impression: z.object({
    impressionUuid: z.string(),
    beaconToken: impreziaBeaconTokenSchema.optional(),
    servedAt: z.string(),
    publisherId: z.string(),
  }),
})
