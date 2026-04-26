import geoip from 'geoip-lite'

import type { NextRequest } from 'next/server'

export const FREE_MODE_ALLOWED_COUNTRIES = new Set([
  'US',
  'CA',
  'GB',
  'AU',
  'NZ',
  'NO',
  'SE',
  'NL',
  'DK',
  'DE',
  'FI',
  'BE',
  'LU',
  'CH',
  'IE',
  'IS',
])

const CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES = new Set(['T1', 'XX'])

export type FreeModeCountryBlockReason =
  | 'country_not_allowed'
  | 'anonymized_or_unknown_country'
  | 'missing_client_ip'
  | 'unresolved_client_ip'

export type FreeModeCountryAccess = {
  allowed: boolean
  countryCode: string | null
  blockReason: FreeModeCountryBlockReason | null
  cfCountry: string | null
  geoipCountry: string | null
  hasClientIp: boolean
}

export function extractClientIp(req: NextRequest): string | undefined {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  return req.headers.get('x-real-ip') ?? undefined
}

export function getFreeModeCountryAccess(
  req: NextRequest,
): FreeModeCountryAccess {
  const cfCountry = req.headers.get('cf-ipcountry')?.toUpperCase() ?? null
  const clientIp = extractClientIp(req)

  if (cfCountry && CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES.has(cfCountry)) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'anonymized_or_unknown_country',
      cfCountry,
      geoipCountry: null,
      hasClientIp: Boolean(clientIp),
    }
  }

  if (cfCountry) {
    const allowed = FREE_MODE_ALLOWED_COUNTRIES.has(cfCountry)
    return {
      allowed,
      countryCode: cfCountry,
      blockReason: allowed ? null : 'country_not_allowed',
      cfCountry,
      geoipCountry: null,
      hasClientIp: Boolean(clientIp),
    }
  }

  if (!clientIp) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'missing_client_ip',
      cfCountry: null,
      geoipCountry: null,
      hasClientIp: false,
    }
  }

  const geoipCountry = geoip.lookup(clientIp)?.country ?? null
  if (!geoipCountry) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'unresolved_client_ip',
      cfCountry: null,
      geoipCountry: null,
      hasClientIp: true,
    }
  }

  const allowed = FREE_MODE_ALLOWED_COUNTRIES.has(geoipCountry)
  return {
    allowed,
    countryCode: geoipCountry,
    blockReason: allowed ? null : 'country_not_allowed',
    cfCountry: null,
    geoipCountry,
    hasClientIp: true,
  }
}
