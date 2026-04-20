import geoip from 'geoip-lite'

import type { NextRequest } from 'next/server'

export const FREE_MODE_ALLOWED_COUNTRIES = new Set([
  'US', 'CA',
  'GB', 'AU', 'NZ',
  'NO', 'SE', 'NL', 'DK', 'DE', 'FI', 'BE', 'LU', 'CH', 'IE', 'IS',
])

export function extractClientIp(req: NextRequest): string | undefined {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') ?? undefined
}

export function getCountryCode(req: NextRequest): string | null {
  const cfCountry = req.headers.get('cf-ipcountry')
  if (cfCountry && cfCountry !== 'XX' && cfCountry !== 'T1') {
    return cfCountry.toUpperCase()
  }

  const clientIp = extractClientIp(req)
  if (!clientIp) {
    return null
  }
  const geo = geoip.lookup(clientIp)
  return geo?.country ?? null
}

/**
 * Returns true if the request's resolved country is allowed to use free
 * mode, false if it's explicitly disallowed. Returns null when country can't
 * be determined (VPN / localhost / corporate proxy) — callers should fail
 * open in that case to match the chat-completions gate.
 */
export function isCountryAllowedForFreeMode(req: NextRequest): boolean | null {
  const countryCode = getCountryCode(req)
  if (!countryCode) return null
  return FREE_MODE_ALLOWED_COUNTRIES.has(countryCode)
}
