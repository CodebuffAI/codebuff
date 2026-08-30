import { describe, expect, test } from 'bun:test'

import { toImpreziaDisplayAd } from '../imprezia-display'

/**
 * Shaped from a real sandbox response on 2026-08-26. The nesting is the point:
 * the creative lives under `linkData['card-N'].metadata.cardMetadata`, not in a
 * flat `creative` like the chat contract.
 */
const response = (over: Record<string, unknown> = {}) => ({
  no_fill: false,
  requestId: 'req_1',
  publisherId: 'pub_1',
  impressionUuid: 'uuid-1',
  clickUrl: 'https://go.imprezia.ai/go/tok',
  linkData: {
    'card-0': {
      hyperlink: 'https://go.imprezia.ai/go/tok',
      originalUrl: 'https://widgets.example',
      ctaText: 'Explore',
      metadata: {
        beaconToken: { token: 'tok', issuedAt: 1, kid: 'k1' },
        cardMetadata: {
          title: 'Ship faster',
          description: 'A tool for shipping',
          brandName: 'Widgets',
          ctaText: 'Try it',
          logoUrl: 'https://cdn.example/logo.png',
          adAssetUrl: 'https://cdn.example/creative.png',
        },
      },
    },
  },
  ...over,
})

describe('toImpreziaDisplayAd', () => {
  test('flattens the nested creative onto one ad', () => {
    // `url` is the interesting field: it comes from `originalUrl`, the
    // advertiser's own page, which the chat contract has no equivalent for —
    // see `impreziaImpressionFields`, which leaves `url` empty for that
    // reason. The beacon token matters just as much: without it a serve can
    // never be reported, and so is never counted.
    expect(toImpreziaDisplayAd(response())?.ad).toMatchObject({
      title: 'Ship faster',
      description: 'A tool for shipping',
      cta: 'Try it',
      brandName: 'Widgets',
      url: 'https://widgets.example',
      clickUrl: 'https://go.imprezia.ai/go/tok',
      imageUrl: 'https://cdn.example/creative.png',
      impressionUuid: 'uuid-1',
      publisherId: 'pub_1',
      beaconToken: { token: 'tok', kid: 'k1' },
    })
  })

  test('an advertiser that sends no URL leaves the destination unnamed', () => {
    const noOriginal = response()
    delete (noOriginal.linkData['card-0'] as { originalUrl?: string })
      .originalUrl
    expect(toImpreziaDisplayAd(noOriginal)?.ad?.url).toBe('')
  })

  test('image fields that are not URLs are dropped', () => {
    // Their sandbox house ad sends the emoji "🎓" as `logoUrl`; handing that to
    // an <img src> renders a broken image next to the title.
    const odd = response()
    const meta = odd.linkData['card-0'].metadata.cardMetadata
    meta.logoUrl = '🎓'
    meta.adAssetUrl = 'javascript:alert(1)'
    expect(toImpreziaDisplayAd(odd)?.ad).toMatchObject({
      logoUrl: '',
      imageUrl: '',
    })
  })

  test('a no-fill is a result, not a failure', () => {
    // Distinct from a malformed body: one is an empty auction, the other is a
    // contract mismatch, and only the second is worth an error log.
    const empty = toImpreziaDisplayAd(response({ no_fill: true }))
    expect(empty).not.toBeNull()
    expect(empty?.ad).toBeNull()
    expect(empty?.requestId).toBe('req_1')

    expect(
      toImpreziaDisplayAd(response({ linkData: undefined }))?.ad,
    ).toBeNull()
  })

  test('a body that is not a display response yields null rather than throwing', () => {
    // This runs behind a screen the user is already looking at; an ad
    // network's bad day must not reach the render path.
    expect(toImpreziaDisplayAd(null)).toBeNull()
    expect(toImpreziaDisplayAd({ requestId: 1 })).toBeNull()
    expect(toImpreziaDisplayAd('nope')).toBeNull()
  })

  test('falls back to the card CTA, then to a default', () => {
    const noCardCta = response()
    delete (
      noCardCta.linkData['card-0'].metadata.cardMetadata as { ctaText?: string }
    ).ctaText
    expect(toImpreziaDisplayAd(noCardCta)?.ad?.cta).toBe('Explore')

    delete (noCardCta.linkData['card-0'] as { ctaText?: string }).ctaText
    expect(toImpreziaDisplayAd(noCardCta)?.ad?.cta).toBe('Learn more')
  })
})
