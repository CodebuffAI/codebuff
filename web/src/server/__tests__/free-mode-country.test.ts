import { describe, expect, test } from 'bun:test'
import { NextRequest } from 'next/server'

import { getFreeModeCountryAccess } from '../free-mode-country'

function makeReq(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/chat/completions', {
    headers,
  })
}

describe('free mode country access', () => {
  test('allows allowlisted Cloudflare countries', () => {
    const access = getFreeModeCountryAccess(makeReq({ 'cf-ipcountry': 'us' }))
    expect(access.allowed).toBe(true)
    expect(access.countryCode).toBe('US')
    expect(access.blockReason).toBe(null)
  })

  test('blocks countries outside the allowlist', () => {
    const access = getFreeModeCountryAccess(makeReq({ 'cf-ipcountry': 'FR' }))
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe('FR')
    expect(access.blockReason).toBe('country_not_allowed')
  })

  test('blocks anonymized Cloudflare country codes without falling back to IP geo', () => {
    const access = getFreeModeCountryAccess(
      makeReq({
        'cf-ipcountry': 'T1',
        'x-forwarded-for': '8.8.8.8',
      }),
    )
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('anonymized_or_unknown_country')
  })

  test('blocks missing client location as unknown', () => {
    const access = getFreeModeCountryAccess(makeReq())
    expect(access.allowed).toBe(false)
    expect(access.countryCode).toBe(null)
    expect(access.blockReason).toBe('missing_client_ip')
  })
})
