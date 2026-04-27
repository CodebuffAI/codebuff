import { createHmac } from 'node:crypto'

import geoip from 'geoip-lite'

import type { NextRequest } from 'next/server'
import type {
  FreebuffCountryBlockReason,
  FreebuffIpPrivacySignal,
} from '@codebuff/common/types/freebuff-session'

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

export type FreeModeCountryBlockReason = FreebuffCountryBlockReason
export type FreeModeIpPrivacySignal = FreebuffIpPrivacySignal

export type FreeModeIpPrivacy = {
  signals: FreeModeIpPrivacySignal[]
}

export type FreeModeCountryAccess = {
  allowed: boolean
  countryCode: string | null
  blockReason: FreeModeCountryBlockReason | null
  cfCountry: string | null
  geoipCountry: string | null
  ipPrivacy: FreeModeIpPrivacy | null
  hasClientIp: boolean
  clientIpHash: string | null
}

export type LookupIpPrivacyFn = (
  ip: string,
) => Promise<FreeModeIpPrivacy | null>

type FreeModeCountryAccessOptions = {
  lookupIpPrivacy?: LookupIpPrivacyFn
  fetch?: typeof globalThis.fetch
  ipinfoToken: string
  ipHashSecret?: string
}

type ResolvedCountryAccess = Omit<
  FreeModeCountryAccess,
  'allowed' | 'blockReason' | 'ipPrivacy' | 'countryCode'
> & {
  countryCode: string
}

export const IPINFO_PRIVACY_CACHE_TTL_MS = 30 * 60 * 1000
const IPINFO_PRIVACY_CACHE_MAX_ENTRIES = 5000
const ipinfoPrivacyCache = new Map<
  string,
  { expiresAt: number; privacy: FreeModeIpPrivacy | null }
>()

const FREE_MODE_BLOCKED_PRIVACY_SIGNALS = new Set<FreeModeIpPrivacySignal>([
  'anonymous',
  'vpn',
  'proxy',
  'tor',
  'relay',
  'res_proxy',
  'hosting',
  'service',
])

export function extractClientIp(req: NextRequest): string | undefined {
  const cfConnectingIp = req.headers.get('cf-connecting-ip')?.trim()
  if (cfConnectingIp) return cfConnectingIp

  const realIp = req.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  return undefined
}

function hashClientIp(
  clientIp: string | undefined,
  secret: string | undefined,
): string | null {
  if (!clientIp || !secret) return null
  return createHmac('sha256', secret).update(clientIp).digest('hex')
}

function setIpinfoPrivacyCache(
  ip: string,
  privacy: FreeModeIpPrivacy | null,
): void {
  while (ipinfoPrivacyCache.size >= IPINFO_PRIVACY_CACHE_MAX_ENTRIES) {
    const oldestIp = ipinfoPrivacyCache.keys().next().value
    if (!oldestIp) break
    ipinfoPrivacyCache.delete(oldestIp)
  }

  ipinfoPrivacyCache.set(ip, {
    expiresAt: Date.now() + IPINFO_PRIVACY_CACHE_TTL_MS,
    privacy,
  })
}

function privacySignalsFromIpinfo(
  data: Record<string, unknown>,
): FreeModeIpPrivacySignal[] {
  const anonymous =
    data.anonymous && typeof data.anonymous === 'object'
      ? (data.anonymous as Record<string, unknown>)
      : {}
  const signals: FreeModeIpPrivacySignal[] = []
  if (data.vpn === true || anonymous.is_vpn === true) signals.push('vpn')
  if (data.proxy === true || anonymous.is_proxy === true) signals.push('proxy')
  if (data.tor === true || anonymous.is_tor === true) signals.push('tor')
  if (data.relay === true || anonymous.is_relay === true) signals.push('relay')
  if (anonymous.is_res_proxy === true) signals.push('res_proxy')
  if (data.hosting === true || data.is_hosting === true) {
    signals.push('hosting')
  }
  if (
    data.service === true ||
    (typeof data.service === 'string' && data.service.length > 0)
  ) {
    signals.push('service')
  }
  if (data.is_anonymous === true) {
    signals.push('anonymous')
  }
  return signals
}

export async function lookupIpinfoPrivacy(params: {
  ip: string
  token: string
  fetch: typeof globalThis.fetch
}): Promise<FreeModeIpPrivacy | null> {
  const cached = ipinfoPrivacyCache.get(params.ip)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.privacy
  }

  const response = await params.fetch(
    `https://api.ipinfo.io/lookup/${encodeURIComponent(params.ip)}?token=${encodeURIComponent(params.token)}`,
  )
  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as Record<string, unknown>
  const signals = privacySignalsFromIpinfo(data)
  const privacy = {
    signals,
  }
  setIpinfoPrivacyCache(params.ip, privacy)
  return privacy
}

export async function getFreeModeCountryAccess(
  req: NextRequest,
  options: FreeModeCountryAccessOptions,
): Promise<FreeModeCountryAccess> {
  const cfCountry = req.headers.get('cf-ipcountry')?.toUpperCase() ?? null
  const clientIp = extractClientIp(req)
  const clientIpHash = hashClientIp(clientIp, options.ipHashSecret)

  if (cfCountry && CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES.has(cfCountry)) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'anonymized_or_unknown_country',
      cfCountry,
      geoipCountry: null,
      ipPrivacy: null,
      hasClientIp: Boolean(clientIp),
      clientIpHash,
    }
  }

  let baseAccess: ResolvedCountryAccess

  if (cfCountry) {
    baseAccess = {
      countryCode: cfCountry,
      cfCountry,
      geoipCountry: null,
      hasClientIp: Boolean(clientIp),
      clientIpHash,
    }
  } else if (!clientIp) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'missing_client_ip',
      cfCountry: null,
      geoipCountry: null,
      ipPrivacy: null,
      hasClientIp: false,
      clientIpHash,
    }
  } else {
    const geoipCountry = geoip.lookup(clientIp)?.country ?? null
    if (!geoipCountry) {
      return {
        allowed: false,
        countryCode: null,
        blockReason: 'unresolved_client_ip',
        cfCountry: null,
        geoipCountry: null,
        ipPrivacy: null,
        hasClientIp: true,
        clientIpHash,
      }
    }

    baseAccess = {
      countryCode: geoipCountry,
      cfCountry: null,
      geoipCountry,
      hasClientIp: true,
      clientIpHash,
    }
  }

  if (!FREE_MODE_ALLOWED_COUNTRIES.has(baseAccess.countryCode)) {
    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'country_not_allowed',
      ipPrivacy: null,
      clientIpHash,
    }
  }

  if (!clientIp) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'missing_client_ip',
      cfCountry,
      geoipCountry: null,
      ipPrivacy: null,
      hasClientIp: false,
      clientIpHash,
    }
  }

  let ipPrivacy: FreeModeIpPrivacy | null
  try {
    ipPrivacy = options.lookupIpPrivacy
      ? await options.lookupIpPrivacy(clientIp)
      : await lookupIpinfoPrivacy({
          ip: clientIp,
          token: options.ipinfoToken,
          fetch: options.fetch ?? globalThis.fetch,
        })
  } catch {
    ipPrivacy = null
  }

  if (!ipPrivacy) {
    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'ip_privacy_lookup_failed',
      ipPrivacy: null,
      clientIpHash,
    }
  }

  if (
    ipPrivacy.signals.some((signal) =>
      FREE_MODE_BLOCKED_PRIVACY_SIGNALS.has(signal),
    )
  ) {
    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'anonymous_network',
      ipPrivacy,
      clientIpHash,
    }
  }

  return {
    ...baseAccess,
    allowed: true,
    blockReason: null,
    ipPrivacy,
    clientIpHash,
  }
}
