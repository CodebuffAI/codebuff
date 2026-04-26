import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'

import {
  getFreeModeCountryAccess,
  lookupIpinfoPrivacy,
} from '../free-mode-country'

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat/completions', {
    headers,
  })
}

const noAnonymousNetwork = {
  ipinfoToken: 'test-token',
  lookupIpPrivacy: async () => ({ signals: [] }),
}

describe('free mode country access', () => {
  test('allows allowlisted Cloudflare countries', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'us',
        'cf-connecting-ip': '203.0.113.10',
      }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe(null)
  })

  test('blocks countries outside the allowlist', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'FR' }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe('FR')
    expect(access.blockReason).toBe('country_not_allowed')
  })

  test('blocks anonymized Cloudflare country codes without falling back to IP geo', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'T1',
        'x-forwarded-for': '8.8.8.8',
      }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('anonymized_or_unknown_country')
  })

  test('blocks missing client location as unknown', async () => {
    const access = await getFreeModeCountryAccess(makeReq(), noAnonymousNetwork)
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('missing_client_ip')
  })

  test('blocks allowlisted Cloudflare countries when client IP is missing', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'US' }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('missing_client_ip')
    expect(access.cfCountry).toBe('US')
  })

  test('uses CF-Connecting-IP as a client IP fallback', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'cf-connecting-ip': '203.0.113.10',
      }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.hasClientIp).toBe(true)
  })

  test('blocks allowlisted countries when the client IP is an anonymous network', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
      },
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe('anonymous_network')
    expect(access.ipPrivacy?.signals).toEqual(['vpn'])
  })

  test('allows allowlisted countries when privacy lookup finds no anonymous signals', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        lookupIpPrivacy: async () => ({
          signals: [],
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.blockReason).toBe(null)
  })

  test('allows allowlisted countries when privacy lookup fails', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        lookupIpPrivacy: async () => {
          throw new Error('provider unavailable')
        },
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.blockReason).toBe(null)
    expect(access.ipPrivacy).toBe(null)
  })

  test('parses IPinfo privacy signals', async () => {
    const fetch = async () =>
      Response.json({
        vpn: true,
        proxy: false,
        tor: true,
        relay: false,
        hosting: true,
        service: 'Example VPN',
      })

    const privacy = await lookupIpinfoPrivacy({
      ip: '203.0.113.10',
      token: 'test-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(privacy).toEqual({
      signals: ['vpn', 'tor', 'hosting', 'service'],
    })
  })
})
