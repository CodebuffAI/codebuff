import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'

import {
  getFreeModePrivacyProviderDecision,
  getFreeModePrivacyDecision,
  getFreeModeCountryAccess,
  getFreeModeRiskScore,
  shouldHardBlockFreeModeAccess,
  lookupIpinfoPrivacy,
  lookupScamalyticsIpRisk,
  lookupSpurIpPrivacy,
  privacySignalsFromScamalytics,
  privacySignalsFromSpur,
} from '../free-mode-country'

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat/completions', {
    headers,
  })
}

const noAnonymousNetwork = {
  ipinfoToken: 'test-token',
  spurToken: 'test-spur-token',
  lookupIpPrivacy: async () => ({ signals: [] }),
}

const IPINFO_PRIVACY_TEST_IP = '198.51.100.42'

describe('free mode country access', () => {
  test.each([
    ['us', 'US'],
    ['LU', 'LU'],
    ['LI', 'LI'],
    ['CH', 'CH'],
    ['AT', 'AT'],
    ['SG', 'SG'],
    ['MT', 'MT'],
    ['IL', 'IL'],
    ['FR', 'FR'],
    ['BE', 'BE'],
    ['IT', 'IT'],
    ['ES', 'ES'],
    ['PT', 'PT'],
  ])('allows allowlisted Cloudflare country %s', async (header, expected) => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': header,
        'cf-connecting-ip': '203.0.113.10',
      }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe(expected)
    expect(access.blockReason).toBe(null)
  })

  test('blocks countries outside the allowlist', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'JP' }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe('JP')
    expect(access.blockReason).toBe('country_not_allowed')
  })

  test('hard-blocks Cloudflare Tor without falling back to IP geo', async () => {
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
    expect(access.ipPrivacy?.signals).toEqual(['tor'])
    expect(shouldHardBlockFreeModeAccess(access)).toBe(true)
  })

  test('limits unknown Cloudflare country codes without falling back to IP geo', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'XX',
        'x-forwarded-for': '8.8.8.8',
      }),
      noAnonymousNetwork,
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('anonymized_or_unknown_country')
    expect(access.ipPrivacy).toBe(null)
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
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

  test('prefers CF-Connecting-IP over X-Forwarded-For', async () => {
    let checkedIp = ''
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'cf-connecting-ip': '203.0.113.10',
        'x-forwarded-for': '198.51.100.42',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async (ip) => {
          checkedIp = ip
          return { signals: [] }
        },
      },
    )
    expect(access.allowed).toBe(true)
    expect(checkedIp).toBe('203.0.113.10')
  })

  test('allows allowlisted countries when Spur does not corroborate IPinfo VPN detection', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: [],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 10,
          risk: 'low',
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe(null)
    expect(access.ipPrivacy?.signals).toEqual(['vpn'])
    expect(access.spurIpPrivacy?.signals).toEqual([])
    expect(access.spurStatus).toBe('clean')
    expect(access.scamalyticsStatus).toBe('clean')
    expect(access.scamalyticsScore).toBe(10)
    expect(getFreeModePrivacyDecision(access)).toBe(
      'ipinfo_suspicious_spur_clean',
    )
    expect(getFreeModePrivacyProviderDecision(access)).toBe('ipinfo_only')
  })

  test('allows allowlisted countries when follow-up providers clear IPinfo residential proxy detection', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['res_proxy'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: [],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 10,
          risk: 'low',
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.blockReason).toBe(null)
    expect(access.ipPrivacy?.signals).toEqual(['res_proxy'])
    expect(access.spurIpPrivacy?.signals).toEqual([])
    expect(access.spurStatus).toBe('clean')
    expect(getFreeModeRiskScore(access)).toBe(70)
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('allows allowlisted countries when Spur does not corroborate IPinfo hosting or service detection', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['hosting', 'service'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: [],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 10,
          risk: 'low',
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.blockReason).toBe(null)
    expect(access.ipPrivacy?.signals).toEqual(['hosting', 'service'])
    expect(access.spurStatus).toBe('clean')
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('keeps corroborated VPN/proxy privacy signals in limited mode', async () => {
    const vpnAccess = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn', 'hosting'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
      },
    )
    expect(vpnAccess.allowed).toBe(false)
    expect(vpnAccess.spurStatus).toBe('suspicious')
    expect(shouldHardBlockFreeModeAccess(vpnAccess)).toBe(false)
    expect(getFreeModePrivacyDecision(vpnAccess)).toBe(
      'scamalytics_failed_limited',
    )
    expect(getFreeModePrivacyProviderDecision(vpnAccess)).toBe(
      'scamalytics_failed',
    )

    const anonymousOnlyAccess = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['anonymous', 'relay'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
      },
    )
    expect(anonymousOnlyAccess.allowed).toBe(false)
    expect(shouldHardBlockFreeModeAccess(anonymousOnlyAccess)).toBe(false)
  })

  test('keeps suspicious traffic limited when Scamalytics does not clear IPinfo signals', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: [],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: ['hosting'],
          score: 80,
          risk: 'high',
        }),
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(access.spurStatus).toBe('clean')
    expect(access.scamalyticsStatus).toBe('suspicious')
    expect(getFreeModeRiskScore(access)).toBe(80)
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('keeps corroborated high-score VPN/proxy traffic limited', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['proxy'],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: ['vpn'],
          score: 90,
          risk: 'very high',
        }),
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(getFreeModeRiskScore(access)).toBe(90)
    expect(getFreeModePrivacyDecision(access)).toBe(
      'scamalytics_suspicious_limited',
    )
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('hard-blocks Tor when corroborated by another provider', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['tor'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: ['tor'],
          score: 90,
          risk: 'very high',
        }),
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(getFreeModeRiskScore(access)).toBe(100)
    expect(getFreeModePrivacyDecision(access)).toBe('corroborated_block')
    expect(shouldHardBlockFreeModeAccess(access)).toBe(true)
  })

  test('hard-blocks residential proxy when Scamalytics also corroborates it', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['res_proxy'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['proxy'],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 60,
          risk: 'medium',
        }),
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(getFreeModeRiskScore(access)).toBe(95)
    expect(getFreeModePrivacyDecision(access)).toBe('corroborated_block')
    expect(shouldHardBlockFreeModeAccess(access)).toBe(true)
  })

  test('keeps IPinfo and Spur residential proxy corroboration limited when Scamalytics is clean', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['res_proxy'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['proxy'],
        }),
        lookupScamalyticsIpRisk: async () => ({
          signals: [],
          score: 20,
          risk: 'low',
        }),
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(getFreeModeRiskScore(access)).toBe(75)
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('keeps Scamalytics outages limited instead of hard-blocked', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['res_proxy'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['proxy'],
        }),
        lookupScamalyticsIpRisk: async () => {
          throw new Error('Scamalytics unavailable')
        },
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(access.scamalyticsStatus).toBe('failed')
    expect(getFreeModePrivacyDecision(access)).toBe(
      'scamalytics_failed_limited',
    )
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('treats Scamalytics API errors as limited, not blocked', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupSpurIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupScamalyticsIpRisk: async () => null,
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(access.scamalyticsStatus).toBe('failed')
    expect(getFreeModeRiskScore(access)).toBe(75)
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('keeps IPinfo VPN/proxy detections in limited mode when Spur lookup fails', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: ['vpn'],
        }),
        lookupSpurIpPrivacy: async () => {
          throw new Error('provider unavailable')
        },
      },
    )

    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('anonymous_network')
    expect(access.ipPrivacy?.signals).toEqual(['vpn'])
    expect(access.spurIpPrivacy).toBe(null)
    expect(access.spurStatus).toBe('failed')
    expect(getFreeModePrivacyDecision(access)).toBe('spur_failed_limited')
    expect(getFreeModePrivacyProviderDecision(access)).toBe('spur_failed')
    expect(shouldHardBlockFreeModeAccess(access)).toBe(false)
  })

  test('allows allowlisted countries when privacy lookup finds no anonymous signals', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => ({
          signals: [],
        }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.blockReason).toBe(null)
  })

  test('blocks allowlisted countries when privacy lookup fails', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        lookupIpPrivacy: async () => {
          throw new Error('provider unavailable')
        },
      },
    )
    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('ip_privacy_lookup_failed')
    expect(access.ipPrivacy).toBe(null)
  })

  test('parses IPinfo Max anonymous signals', async () => {
    let requestedUrl = ''
    const fetch = async (url: string | URL | Request) => {
      requestedUrl = String(url)
      return Response.json({
        anonymous: {
          name: 'ExampleVPN',
          last_seen: '2026-05-23',
          percent_days_seen: 63,
          is_proxy: false,
          is_relay: true,
          is_tor: true,
          is_vpn: false,
          is_res_proxy: true,
        },
        is_anonymous: true,
        is_hosting: true,
      })
    }

    const privacy = await lookupIpinfoPrivacy({
      ip: IPINFO_PRIVACY_TEST_IP,
      token: 'test-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(requestedUrl).toContain('https://api.ipinfo.io/lookup/')
    expect(privacy).toEqual({
      signals: ['tor', 'relay', 'res_proxy', 'hosting', 'anonymous'],
      providerName: 'ExampleVPN',
      lastSeen: '2026-05-23',
      percentDaysSeen: 63,
    })
  })

  test('hashes client IP when a hash secret is provided', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'US',
        'x-forwarded-for': '203.0.113.10',
      }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        ipHashSecret: 'secret',
        lookupIpPrivacy: async () => ({ signals: [] }),
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.clientIpHash).toHaveLength(64)
    expect(access.clientIpHash).not.toContain('203.0.113.10')
  })

  test('blocks generic IPinfo anonymous results without a specific signal', async () => {
    const fetch = async () =>
      Response.json({
        is_anonymous: true,
      })

    const privacy = await lookupIpinfoPrivacy({
      ip: '198.51.100.43',
      token: 'test-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(privacy).toEqual({
      signals: ['anonymous'],
      providerName: null,
      lastSeen: null,
      percentDaysSeen: null,
    })
  })

  test('parses Spur Context API anonymizer signals', async () => {
    let requestedUrl = ''
    let tokenHeader = ''
    const fetch = async (url: string | URL | Request, init?: RequestInit) => {
      requestedUrl = String(url)
      tokenHeader =
        init?.headers &&
        typeof init.headers === 'object' &&
        !Array.isArray(init.headers)
          ? String((init.headers as Record<string, string>).Token)
          : ''
      return Response.json({
        risks: ['CALLBACK_PROXY', 'GEO_MISMATCH'],
        client: {
          proxies: ['OXYLABS_PROXY'],
        },
        tunnels: [
          {
            type: 'VPN',
            operator: 'PROTON_VPN',
          },
          {
            type: 'TOR',
          },
        ],
      })
    }

    const privacy = await lookupSpurIpPrivacy({
      ip: '198.51.100.45',
      token: 'spur-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(requestedUrl).toBe('https://api.spur.us/v2/context/198.51.100.45')
    expect(tokenHeader).toBe('spur-token')
    expect(privacy).toEqual({
      signals: ['vpn', 'tor', 'proxy'],
    })
  })

  test('parses Scamalytics fraud score and proxy signals', async () => {
    let requestedUrl = ''
    const fetch = async (url: string | URL | Request) => {
      requestedUrl = String(url)
      return Response.json({
        scamalytics: {
          status: 'ok',
          scamalytics_score: 88,
          scamalytics_risk: 'high',
          scamalytics_proxy: {
            is_vpn: true,
            is_datacenter: true,
            is_apple_icloud_private_relay: true,
          },
        },
        external_datasources: {
          ip2proxy: {
            proxy_type: 'PUB',
          },
        },
      })
    }

    const risk = await lookupScamalyticsIpRisk({
      ip: '198.51.100.46',
      apiKey: 'scamalytics-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(requestedUrl).toBe(
      'https://api11.scamalytics.com/v3/codebuff/?key=scamalytics-token&ip=198.51.100.46',
    )
    expect(risk).toEqual({
      signals: ['vpn', 'relay', 'hosting'],
      score: 88,
      risk: 'high',
    })
  })

  test('parses Scamalytics datasource VPN/Tor types without treating generic proxy labels as hard evidence', () => {
    expect(
      privacySignalsFromScamalytics({
        external_datasources: {
          ip2proxy: { proxy_type: 'VPN' },
          ip2proxy_lite: { proxy_type: 'PUB', usage_type: 'DCH' },
          x4bnet: { is_tor: true },
        },
      }),
    ).toEqual(['vpn', 'hosting', 'tor'])
  })

  test('parses top-level Scamalytics proxy evidence', () => {
    expect(
      privacySignalsFromScamalytics({
        scamalytics: {
          scamalytics_proxy: {
            is_proxy: true,
          },
        },
      }),
    ).toEqual(['proxy'])
  })

  test('parses Tor from Spur tunnel operator context', () => {
    expect(
      privacySignalsFromSpur({
        tunnels: [
          {
            operator: 'TOR_PROXY',
            type: 'PROXY',
          },
        ],
      }),
    ).toEqual(['tor', 'proxy'])
  })

  test('parses VPN protocol services from Spur context', () => {
    expect(
      privacySignalsFromSpur({
        services: ['OPENVPN', 'WIREGUARD', 'HTTPS'],
      }),
    ).toEqual(['vpn'])
  })

  test('parses explicit Tor/proxy client behaviors from Spur context', () => {
    expect(
      privacySignalsFromSpur({
        client: {
          behaviors: ['FILE_SHARING', 'TOR_PROXY_USER'],
        },
      }),
    ).toEqual(['tor'])
  })

  test('does not treat generic Spur proxy risk strings as corroboration', () => {
    expect(
      privacySignalsFromSpur({
        risks: ['CALLBACK_PROXY'],
      }),
    ).toEqual([])
  })

  test('allowLocalhost bypasses gating when no CF country and no client IP', async () => {
    const access = await getFreeModeCountryAccess(makeReq(), {
      ipinfoToken: 'test-token',
      spurToken: 'test-spur-token',
      allowLocalhost: true,
    })
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe(null)
    expect(access.ipPrivacy?.signals).toEqual([])
  })

  test('allowLocalhost bypasses gating for loopback client IPs', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'x-forwarded-for': '127.0.0.1' }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        allowLocalhost: true,
      },
    )
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe(null)
  })

  test('allowLocalhost does not bypass when cf-ipcountry is set', async () => {
    const access = await getFreeModeCountryAccess(
      makeReq({ 'cf-ipcountry': 'JP' }),
      {
        ipinfoToken: 'test-token',
        spurToken: 'test-spur-token',
        allowLocalhost: true,
      },
    )
    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('country_not_allowed')
  })

  test('allowLocalhost off (default) keeps the strict missing-IP block', async () => {
    const access = await getFreeModeCountryAccess(makeReq(), {
      ipinfoToken: 'test-token',
      spurToken: 'test-spur-token',
    })
    expect(access.allowed).toBe(false)
    expect(access.blockReason).toBe('missing_client_ip')
  })

  test('treats is_anonymous as blocking even when service is present', async () => {
    const fetch = async () =>
      Response.json({
        service: 'Privacy Provider',
        is_anonymous: true,
      })

    const privacy = await lookupIpinfoPrivacy({
      ip: '198.51.100.44',
      token: 'test-token',
      fetch: fetch as unknown as typeof globalThis.fetch,
    })

    expect(privacy).toEqual({
      signals: ['service', 'anonymous'],
      providerName: 'Privacy Provider',
      lastSeen: null,
      percentDaysSeen: null,
    })
  })
})
