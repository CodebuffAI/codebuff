import { describe, expect, test } from 'bun:test'

import { evaluateClientHints } from '../client-hints'
import { getFreeModeCountryAccess } from '../country-access'

import type { FreeModeCountryAccessOptions } from '../country-access'

function makeReq(headers: Record<string, string> = {}): { headers: Headers } {
  return { headers: new Headers(headers) }
}

const baseOptions: FreeModeCountryAccessOptions = {
  ipinfoToken: 'test-token',
  spurToken: 'test-spur-token',
  lookupIpPrivacy: async () => ({ signals: [] }),
}

describe('evaluateClientHints', () => {
  test('US IP with non-allowlisted timezone is suspicious', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'US',
      timezone: 'Asia/Kolkata',
      tzOffsetMinutes: -330,
    })
    expect(result.suspicious).toBe(true)
    expect(result.reasons).toContain('timezone_country_mismatch')
    expect(result.hintCountry).toBe('IN')
  })

  test('US IP with US timezone is clean', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'US',
      timezone: 'America/New_York',
      tzOffsetMinutes: 300, // EST
      languages: ['en-US', 'en'],
    })
    expect(result.suspicious).toBe(false)
    expect(result.reasons).toEqual([])
  })

  test('offset contradicting the claimed zone is suspicious (spoof tell)', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'US',
      timezone: 'America/New_York',
      tzOffsetMinutes: -330, // clock says UTC+5:30, zone claims US east coast
    })
    expect(result.suspicious).toBe(true)
    expect(result.reasons).toContain('offset_zone_mismatch')
  })

  test('accepts either standard or DST offset for the claimed zone', () => {
    for (const offset of [300, 240]) {
      const result = evaluateClientHints({
        ipCountryCode: 'US',
        timezone: 'America/New_York',
        tzOffsetMinutes: offset,
      })
      expect(result.suspicious).toBe(false)
    }
  })

  test('language mismatch alone never flags', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'US',
      timezone: 'America/Los_Angeles',
      tzOffsetMinutes: 480,
      languages: ['hi-IN', 'ta-IN'],
    })
    expect(result.suspicious).toBe(false)
    expect(result.reasons).toContain('language_country_mismatch')
  })

  test('non-allowlisted IP country produces no mismatch flags (hints never upgrade)', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'IN',
      timezone: 'America/New_York',
      tzOffsetMinutes: 300,
      languages: ['en-US'],
    })
    expect(result.suspicious).toBe(false)
  })

  test('missing hints behave as clean', () => {
    const result = evaluateClientHints({ ipCountryCode: 'US' })
    expect(result.suspicious).toBe(false)
    expect(result.timezone).toBeNull()
    expect(result.languages).toBeNull()
  })

  test('unknown timezone does not flag', () => {
    const result = evaluateClientHints({
      ipCountryCode: 'US',
      timezone: 'Not/AZone',
      tzOffsetMinutes: 300,
    })
    expect(result.suspicious).toBe(false)
  })
})

describe('getFreeModeCountryAccess with client hints', () => {
  const suspiciousHints = {
    timezone: 'Asia/Kolkata',
    tzOffsetMinutes: -330,
    languages: ['hi-IN'],
  }

  test('clean IPinfo + suspicious hints + both providers clean stays allowed', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'US', 'x-real-ip': '203.0.113.5' }),
      {
        ...baseOptions,
        clientHints: suspiciousHints,
        lookupSpurIpPrivacy: async () => ({ signals: [] }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 0,
          risk: 'low',
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.clientHints?.suspicious).toBe(true)
    expect(access.spurStatus).toBe('clean')
  })

  test('clean IPinfo + suspicious hints + Spur flag downgrades to limited', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'US', 'x-real-ip': '203.0.113.6' }),
      {
        ...baseOptions,
        clientHints: suspiciousHints,
        lookupSpurIpPrivacy: async () => ({ signals: ['vpn'] }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 0,
          risk: 'low',
        }),
      },
    )
    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
  })

  test('clean IPinfo + clean hints skips the second-opinion chain', async () => {
    let spurCalled = false
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'US', 'x-real-ip': '203.0.113.7' }),
      {
        ...baseOptions,
        clientHints: {
          timezone: 'America/New_York',
          tzOffsetMinutes: 300,
          languages: ['en-US'],
        },
        lookupSpurIpPrivacy: async () => {
          spurCalled = true
          return { signals: [] }
        },
      },
    )
    expect(access.allowed).toBe(true)
    expect(spurCalled).toBe(false)
    expect(access.spurStatus).toBe('not_checked')
  })

  test('suspicious hints cannot upgrade a non-allowlisted country', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'IN', 'x-real-ip': '203.0.113.8' }),
      {
        ...baseOptions,
        clientHints: {
          timezone: 'America/New_York',
          tzOffsetMinutes: 300,
          languages: ['en-US'],
        },
      },
    )
    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('country_not_allowed')
  })
})
