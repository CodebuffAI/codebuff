import { createHmac } from 'node:crypto'

import geoip from 'geoip-lite'
import {
  FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS,
  isFreebuffHardBlockedPrivacySignal,
} from '@codebuff/common/util/freebuff-privacy'

import type { NextRequest } from 'next/server'
import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type {
  FreebuffCountryBlockReason,
  FreebuffIpPrivacySignal,
  FreebuffPrivacyDecision,
  FreebuffPrivacyProviderDecision,
  FreebuffSpurStatus,
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
  'FR',
  'IT',
  'ES',
  'PT',
  'FI',
  'BE',
  'LU',
  'LI',
  'CH',
  'AT',
  'SG',
  'MT',
  'IL',
  'IE',
  'IS',
])

const CLOUDFLARE_TOR_COUNTRY = 'T1'
const CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES = new Set([
  CLOUDFLARE_TOR_COUNTRY,
  'XX',
])

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
  spurIpPrivacy: FreeModeIpPrivacy | null
  spurStatus: FreebuffSpurStatus
  hasClientIp: boolean
  clientIpHash: string | null
}

export type LookupIpPrivacyFn = (
  ip: string,
) => Promise<FreeModeIpPrivacy | null>

export type LookupSpurIpPrivacyFn = (
  ip: string,
) => Promise<FreeModeIpPrivacy | null>

export function getFreeModeAccessTier(
  countryAccess: Pick<FreeModeCountryAccess, 'allowed'>,
): FreebuffAccessTier {
  return countryAccess.allowed ? 'full' : 'limited'
}

export type FreeModeCountryAccessOptions = {
  lookupIpPrivacy?: LookupIpPrivacyFn
  lookupSpurIpPrivacy?: LookupSpurIpPrivacyFn
  fetch?: typeof globalThis.fetch
  ipinfoToken: string
  spurToken: string
  ipHashSecret?: string
  allowLocalhost?: boolean
  /** Dev-only escape hatch: when true (and `allowLocalhost` is also true),
   *  the localhost bypass returns `allowed: false` so callers exercise the
   *  limited Freebuff tier instead of full. Cache writes/reads are skipped
   *  for these requests (clientIpHash is nulled) so flipping the flag takes
   *  effect on the next request without manual cache eviction. */
  forceLimited?: boolean
}

const LOCALHOST_IPS = new Set(['::1', '::ffff:127.0.0.1'])

function isLocalhostIp(ip: string): boolean {
  return ip.startsWith('127.') || LOCALHOST_IPS.has(ip)
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
const spurPrivacyCache = new Map<
  string,
  { expiresAt: number; privacy: FreeModeIpPrivacy | null }
>()

const FREE_MODE_LIMITED_PRIVACY_SIGNALS = new Set<FreeModeIpPrivacySignal>([
  ...FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS,
  'anonymous',
  'relay',
  'hosting',
  'service',
])

export function hasHardBlockedPrivacySignal(
  ipPrivacy: FreeModeIpPrivacy | null | undefined,
): boolean {
  return ipPrivacy?.signals.some(isFreebuffHardBlockedPrivacySignal) ?? false
}

export function shouldHardBlockFreeModeAccess(
  countryAccess: Pick<
    FreeModeCountryAccess,
    'blockReason' | 'cfCountry' | 'ipPrivacy' | 'spurIpPrivacy'
  >,
): boolean {
  return (
    countryAccess.cfCountry === CLOUDFLARE_TOR_COUNTRY ||
    (countryAccess.blockReason === 'anonymous_network' &&
      hasHardBlockedPrivacySignal(countryAccess.ipPrivacy) &&
      hasHardBlockedPrivacySignal(countryAccess.spurIpPrivacy))
  )
}

export function getFreeModePrivacyDecision(
  countryAccess: Pick<
    FreeModeCountryAccess,
    | 'allowed'
    | 'blockReason'
    | 'cfCountry'
    | 'ipPrivacy'
    | 'spurIpPrivacy'
    | 'spurStatus'
  >,
): FreebuffPrivacyDecision {
  if (countryAccess.allowed) {
    return countryAccess.spurStatus === 'clean' &&
      countryAccess.ipPrivacy?.signals.length
      ? 'ipinfo_suspicious_spur_clean'
      : 'allowed_clean'
  }
  if (countryAccess.cfCountry === CLOUDFLARE_TOR_COUNTRY) {
    return 'cloudflare_tor_block'
  }
  if (countryAccess.blockReason === 'ip_privacy_lookup_failed') {
    return 'ipinfo_failed_limited'
  }
  if (countryAccess.blockReason === 'anonymous_network') {
    if (
      hasHardBlockedPrivacySignal(countryAccess.ipPrivacy) &&
      hasHardBlockedPrivacySignal(countryAccess.spurIpPrivacy)
    ) {
      return 'corroborated_block'
    }
    if (countryAccess.spurStatus === 'failed') {
      return 'spur_failed_limited'
    }
  }
  return 'limited_other'
}

export function getFreeModePrivacyProviderDecision(
  countryAccess: Pick<
    FreeModeCountryAccess,
    | 'blockReason'
    | 'cfCountry'
    | 'ipPrivacy'
    | 'spurIpPrivacy'
    | 'spurStatus'
  >,
): FreebuffPrivacyProviderDecision {
  if (countryAccess.cfCountry === CLOUDFLARE_TOR_COUNTRY) {
    return 'cloudflare_tor'
  }
  if (countryAccess.blockReason === 'ip_privacy_lookup_failed') {
    return 'ipinfo_failed'
  }
  if (!countryAccess.ipPrivacy) {
    return 'not_checked'
  }
  if (countryAccess.ipPrivacy.signals.length === 0) {
    return 'ipinfo_clean'
  }
  if (countryAccess.spurStatus === 'failed') {
    return 'spur_failed'
  }
  if (countryAccess.spurStatus === 'clean') {
    return 'ipinfo_only'
  }
  if (
    countryAccess.spurStatus === 'suspicious' &&
    hasHardBlockedPrivacySignal(countryAccess.ipPrivacy) &&
    hasHardBlockedPrivacySignal(countryAccess.spurIpPrivacy)
  ) {
    return 'corroborated_hard'
  }
  if (countryAccess.spurStatus === 'suspicious') {
    return 'corroborated_soft'
  }
  return 'not_checked'
}

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

export function hashClientIp(
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

function setSpurPrivacyCache(
  ip: string,
  privacy: FreeModeIpPrivacy | null,
): void {
  while (spurPrivacyCache.size >= IPINFO_PRIVACY_CACHE_MAX_ENTRIES) {
    const oldestIp = spurPrivacyCache.keys().next().value
    if (!oldestIp) break
    spurPrivacyCache.delete(oldestIp)
  }

  spurPrivacyCache.set(ip, {
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

function pushUniqueSignal(
  signals: FreeModeIpPrivacySignal[],
  signal: FreeModeIpPrivacySignal,
): void {
  if (!signals.includes(signal)) signals.push(signal)
}

function signalFromSpurValue(value: unknown): FreeModeIpPrivacySignal | null {
  if (typeof value !== 'string') return null
  const normalized = value.toUpperCase()
  if (normalized.includes('RESIDENTIAL') || normalized.includes('RES_PROXY')) {
    return 'res_proxy'
  }
  if (normalized.includes('TOR')) return 'tor'
  if (normalized.includes('VPN')) return 'vpn'
  if (normalized.includes('PROXY')) return 'proxy'
  return null
}

function signalFromSpurService(value: unknown): FreeModeIpPrivacySignal | null {
  if (typeof value !== 'string') return null
  const normalized = value.toUpperCase()
  if (
    normalized === 'OPENVPN' ||
    normalized === 'WIREGUARD' ||
    normalized === 'IPSEC' ||
    normalized.includes('VPN')
  ) {
    return 'vpn'
  }
  return null
}

export function privacySignalsFromSpur(
  data: Record<string, unknown>,
): FreeModeIpPrivacySignal[] {
  const signals: FreeModeIpPrivacySignal[] = []

  const services = Array.isArray(data.services) ? data.services : []
  for (const service of services) {
    const signal = signalFromSpurService(service)
    if (signal) pushUniqueSignal(signals, signal)
  }

  const tunnels = Array.isArray(data.tunnels) ? data.tunnels : []
  for (const tunnel of tunnels) {
    if (!tunnel || typeof tunnel !== 'object') continue
    const tunnelRecord = tunnel as Record<string, unknown>
    const operatorSignal = signalFromSpurValue(tunnelRecord.operator)
    if (operatorSignal) pushUniqueSignal(signals, operatorSignal)
    const signal = signalFromSpurValue(tunnelRecord.type)
    if (signal) pushUniqueSignal(signals, signal)
  }

  const client =
    data.client && typeof data.client === 'object'
      ? (data.client as Record<string, unknown>)
      : {}
  const behaviors = Array.isArray(client.behaviors) ? client.behaviors : []
  for (const behavior of behaviors) {
    const signal = signalFromSpurValue(behavior)
    if (signal) pushUniqueSignal(signals, signal)
  }

  const proxies = Array.isArray(client.proxies) ? client.proxies : []
  for (const proxy of proxies) {
    const signal = signalFromSpurValue(proxy) ?? 'proxy'
    pushUniqueSignal(signals, signal)
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

export async function lookupSpurIpPrivacy(params: {
  ip: string
  token: string
  fetch: typeof globalThis.fetch
}): Promise<FreeModeIpPrivacy | null> {
  const cached = spurPrivacyCache.get(params.ip)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.privacy
  }

  const response = await params.fetch(
    `https://api.spur.us/v2/context/${encodeURIComponent(params.ip)}`,
    {
      headers: {
        Token: params.token,
      },
    },
  )
  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as Record<string, unknown>
  const privacy = {
    signals: privacySignalsFromSpur(data),
  }
  setSpurPrivacyCache(params.ip, privacy)
  return privacy
}

async function lookupSpurPrivacyStatus(
  clientIp: string,
  options: FreeModeCountryAccessOptions,
): Promise<{
  privacy: FreeModeIpPrivacy | null
  status: FreebuffSpurStatus
}> {
  try {
    const privacy = options.lookupSpurIpPrivacy
      ? await options.lookupSpurIpPrivacy(clientIp)
      : await lookupSpurIpPrivacy({
          ip: clientIp,
          token: options.spurToken,
          fetch: options.fetch ?? globalThis.fetch,
        })
    if (!privacy) return { privacy: null, status: 'failed' }
    return {
      privacy,
      status: hasHardBlockedPrivacySignal(privacy) ? 'suspicious' : 'clean',
    }
  } catch {
    return { privacy: null, status: 'failed' }
  }
}

const NOT_CHECKED_SPUR_CONTEXT = {
  spurIpPrivacy: null,
  spurStatus: 'not_checked' as const,
}

export async function getFreeModeCountryAccess(
  req: NextRequest,
  options: FreeModeCountryAccessOptions,
): Promise<FreeModeCountryAccess> {
  const cfCountry = req.headers.get('cf-ipcountry')?.toUpperCase() ?? null
  const clientIp = extractClientIp(req)
  const clientIpHash = hashClientIp(clientIp, options.ipHashSecret)

  // Dev-only bypass: when no Cloudflare country header is set and the request
  // is from loopback (or has no client IP at all), treat it as US-allowed so
  // local development doesn't require ipinfo or geoip resolution. In
  // production behind Cloudflare, cf-ipcountry is always set, so this branch
  // is unreachable.
  if (
    options.allowLocalhost &&
    !cfCountry &&
    (!clientIp || isLocalhostIp(clientIp))
  ) {
    if (options.forceLimited) {
      return {
        allowed: false,
        countryCode: 'US',
        blockReason: 'country_not_allowed',
        cfCountry: null,
        geoipCountry: null,
        ipPrivacy: { signals: [] },
        ...NOT_CHECKED_SPUR_CONTEXT,
        hasClientIp: Boolean(clientIp),
        // Null hash skips the country-access cache so toggling the env var
        // takes effect immediately without evicting prior allowed=true rows.
        clientIpHash: null,
      }
    }
    return {
      allowed: true,
      countryCode: 'US',
      blockReason: null,
      cfCountry: null,
      geoipCountry: null,
      ipPrivacy: { signals: [] },
      ...NOT_CHECKED_SPUR_CONTEXT,
      hasClientIp: Boolean(clientIp),
      clientIpHash,
    }
  }

  if (cfCountry && CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES.has(cfCountry)) {
    return {
      allowed: false,
      countryCode: null,
      blockReason: 'anonymized_or_unknown_country',
      cfCountry,
      geoipCountry: null,
      ipPrivacy:
        cfCountry === CLOUDFLARE_TOR_COUNTRY ? { signals: ['tor'] } : null,
      ...NOT_CHECKED_SPUR_CONTEXT,
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
      ...NOT_CHECKED_SPUR_CONTEXT,
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
      ...NOT_CHECKED_SPUR_CONTEXT,
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
        ...NOT_CHECKED_SPUR_CONTEXT,
        hasClientIp: true,
        clientIpHash,
      }
    }

    baseAccess = {
      countryCode: geoipCountry,
      cfCountry: null,
      geoipCountry,
      ...NOT_CHECKED_SPUR_CONTEXT,
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
      ...NOT_CHECKED_SPUR_CONTEXT,
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
      ...NOT_CHECKED_SPUR_CONTEXT,
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
      ...NOT_CHECKED_SPUR_CONTEXT,
      clientIpHash,
    }
  }

  if (
    ipPrivacy.signals.some((signal) =>
      FREE_MODE_LIMITED_PRIVACY_SIGNALS.has(signal),
    )
  ) {
    const { privacy: spurIpPrivacy, status: spurStatus } =
      await lookupSpurPrivacyStatus(clientIp, options)

    if (spurIpPrivacy && spurStatus === 'clean') {
      return {
        ...baseAccess,
        allowed: true,
        blockReason: null,
        ipPrivacy,
        spurIpPrivacy,
        spurStatus,
        clientIpHash,
      }
    }

    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'anonymous_network',
      ipPrivacy,
      spurIpPrivacy,
      spurStatus,
      clientIpHash,
    }
  }

  return {
    ...baseAccess,
    allowed: true,
    blockReason: null,
    ipPrivacy,
    spurIpPrivacy: null,
    spurStatus: 'not_checked',
    clientIpHash,
  }
}
