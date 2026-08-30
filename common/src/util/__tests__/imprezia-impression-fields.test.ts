import { describe, expect, test } from 'bun:test'

import {
  impreziaImpressionFields,
  impreziaImpressionUrl,
  parseImpreziaBeaconRecord,
} from '../imprezia-ad'

import type { ImpreziaAd } from '../imprezia-ad'

const ad: ImpreziaAd = {
  creative: {
    brandName: 'Acme',
    title: 'Ship faster',
    description: 'A tool for shipping',
    cta: 'Try it',
    logoUrl: 'https://cdn.example/logo.png',
  },
  clickUrl: 'https://click.imprezia.ai/abc',
  impression: {
    impressionUuid: 'uuid-1',
    beaconToken: { token: 'tok', issuedAt: 123, kid: 'k1' },
    servedAt: '2026-08-22T00:00:00.000Z',
    publisherId: 'pub-1',
  },
}

const fields = () =>
  impreziaImpressionFields({
    ad,
    requestId: 'req-1',
    sessionId: 'sess-1',
    baseUrl: 'https://api.imprezia.ai',
  })

describe('imprezia impression fields', () => {
  test('imp_url carries the impressionUuid', () => {
    // The join key: Imprezia's response has no payout, so per-arm revenue is
    // only assemblable by matching their billed impressions back to our
    // tagged rows through this id.
    expect(fields().impUrl).toBe(impreziaImpressionUrl('uuid-1'))
    expect(fields().impUrl).toContain('uuid-1')
  })

  test('maps the creative onto the ledger columns', () => {
    expect(fields()).toMatchObject({
      adText: 'A tool for shipping',
      title: 'Ship faster',
      cta: 'Try it',
      // No landing page, so no domain for a renderer to show; see the mapper.
      url: '',
      clickUrl: 'https://click.imprezia.ai/abc',
      favicon: 'https://cdn.example/logo.png',
    })
  })

  test('carries the beacon forward so the impression can be reported later', () => {
    // The auction and the render happen in different requests; a token that
    // does not survive means the serve can never be billed.
    const record = parseImpreziaBeaconRecord(fields().providerMeta)
    expect(record).toMatchObject({
      baseUrl: 'https://api.imprezia.ai',
      requestId: 'req-1',
      sessionId: 'sess-1',
      clickUrl: 'https://click.imprezia.ai/abc',
    })
    expect(record?.impression.beaconToken?.token).toBe('tok')
  })

  test('a missing logo becomes an empty favicon, not undefined', () => {
    // favicon is NOT NULL on ad_impression.
    const withoutLogo = impreziaImpressionFields({
      ad: { ...ad, creative: { ...ad.creative, logoUrl: undefined } },
      requestId: 'r',
      sessionId: 's',
      baseUrl: 'https://api.imprezia.ai',
    })
    expect(withoutLogo.favicon).toBe('')
  })
})
