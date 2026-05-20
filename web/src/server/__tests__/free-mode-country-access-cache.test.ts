import { describe, expect, mock, test } from 'bun:test'
import { NextRequest } from 'next/server'

import {
  expiresAtForCountryAccess,
  FREE_MODE_COUNTRY_CACHE_ALLOWED_TTL_MS,
  FREE_MODE_COUNTRY_CACHE_ANONYMOUS_NETWORK_TTL_MS,
  FREE_MODE_COUNTRY_CACHE_COUNTRY_NOT_ALLOWED_TTL_MS,
  FREE_MODE_COUNTRY_CACHE_TRANSIENT_BLOCK_TTL_MS,
  getCachedFreeModeCountryAccess,
} from '../free-mode-country-access-cache'
import { hashClientIp } from '../free-mode-country'

import type { FreeModeCountryAccess } from '../free-mode-country'
import type { FreeModeCountryAccessCacheStore } from '../free-mode-country-access-cache'

const now = new Date('2026-05-12T12:00:00Z')
const userId = 'user-123'
const ipHashSecret = 'test-secret'
const clientIp = '203.0.113.10'
const clientIpHash = hashClientIp(clientIp, ipHashSecret)!

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat/completions', {
    headers,
  })
}

function allowedAccess(): FreeModeCountryAccess {
  return {
    allowed: true,
    countryCode: 'US',
    blockReason: null,
    cfCountry: 'US',
    geoipCountry: null,
    ipPrivacy: { signals: [] },
    hasClientIp: true,
    clientIpHash,
  }
}

describe('free mode country access cache', () => {
  test('uses a fresh cached country decision without calling IPinfo', async () => {
    const cached = allowedAccess()
    const cacheStore: FreeModeCountryAccessCacheStore = {
      get: mock(async () => cached),
      set: mock(async () => {}),
    }
    const fetch = mock(async () => {
      throw new Error('IPinfo should not be called on cache hit')
    }) as unknown as typeof globalThis.fetch

    const access = await getCachedFreeModeCountryAccess({
      userId,
      req: makeReq({
        'cf-ipcountry': 'US',
        'cf-connecting-ip': clientIp,
      }),
      options: {
        fetch,
        ipinfoToken: 'test-token',
        ipHashSecret,
      },
      cacheStore,
      now,
    })

    expect(access).toBe(cached)
    expect(cacheStore.get).toHaveBeenCalledWith({
      userId,
      clientIpHash,
      cfCountry: 'US',
      now,
    })
    expect(cacheStore.set).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  test('stores a fresh country decision after a cache miss', async () => {
    const stored: FreeModeCountryAccess[] = []
    const cacheStore: FreeModeCountryAccessCacheStore = {
      get: mock(async () => null),
      set: mock(async ({ access }) => {
        stored.push(access)
      }),
    }
    const fetch = mock(async () =>
      Response.json({}),
    ) as unknown as typeof globalThis.fetch

    const access = await getCachedFreeModeCountryAccess({
      userId,
      req: makeReq({
        'cf-ipcountry': 'US',
        'cf-connecting-ip': clientIp,
      }),
      options: {
        fetch,
        ipinfoToken: 'test-token',
        ipHashSecret,
      },
      cacheStore,
      now,
    })

    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(stored[0]).toEqual(access)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('refreshes when the cache store reports a stale entry', async () => {
    const stale = allowedAccess()
    const staleRefreshIp = '203.0.113.11'
    const cacheStore: FreeModeCountryAccessCacheStore = {
      get: mock(async ({ now: cacheNow }) =>
        cacheNow.getTime() < now.getTime() ? stale : null,
      ),
      set: mock(async () => {}),
    }
    const fetch = mock(async () =>
      Response.json({}),
    ) as unknown as typeof globalThis.fetch

    const access = await getCachedFreeModeCountryAccess({
      userId,
      req: makeReq({
        'cf-ipcountry': 'US',
        'cf-connecting-ip': staleRefreshIp,
      }),
      options: {
        fetch,
        ipinfoToken: 'test-token',
        ipHashSecret,
      },
      cacheStore,
      now,
    })

    expect(access.allowed).toBe(true)
    expect(cacheStore.set).toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  test('uses shorter TTLs for VPN and transient blocks than country blocks', () => {
    const base = allowedAccess()

    expect(expiresAtForCountryAccess(base, now).getTime() - now.getTime()).toBe(
      FREE_MODE_COUNTRY_CACHE_ALLOWED_TTL_MS,
    )
    expect(
      expiresAtForCountryAccess(
        { ...base, allowed: false, blockReason: 'anonymous_network' },
        now,
      ).getTime() - now.getTime(),
    ).toBe(FREE_MODE_COUNTRY_CACHE_ANONYMOUS_NETWORK_TTL_MS)
    expect(
      expiresAtForCountryAccess(
        { ...base, allowed: false, blockReason: 'country_not_allowed' },
        now,
      ).getTime() - now.getTime(),
    ).toBe(FREE_MODE_COUNTRY_CACHE_COUNTRY_NOT_ALLOWED_TTL_MS)
    expect(
      expiresAtForCountryAccess(
        { ...base, allowed: false, blockReason: 'ip_privacy_lookup_failed' },
        now,
      ).getTime() - now.getTime(),
    ).toBe(FREE_MODE_COUNTRY_CACHE_TRANSIENT_BLOCK_TTL_MS)
  })
})
