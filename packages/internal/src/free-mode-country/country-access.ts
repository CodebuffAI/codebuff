import { createHmac } from 'node:crypto'

import {
  FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS,
  isFreebuffBenignAsType,
  isFreebuffHardBlockedPrivacySignal,
  isFreebuffHostingAsType,
} from '@codebuff/common/util/freebuff-privacy'

import { FREE_MODE_ALLOWED_COUNTRIES } from './allowed-countries'
import {
  evaluateClientHints,
  type ClientHintsInput,
  type ClientHintsEvaluation,
} from './client-hints'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'
import type {
  FreebuffCountryBlockReason,
  FreebuffIpPrivacySignal,
  FreebuffPrivacyDecision,
  FreebuffPrivacyProviderDecision,
  FreebuffScamalyticsStatus,
  FreebuffSpurStatus,
} from '@codebuff/common/types/freebuff-session'

/** Anything with a Headers object — satisfied structurally by NextRequest,
 *  Fetch API Request, or a plain `{ headers }` wrapper. */
export type HeadersCarrier = { headers: Headers }

export { FREE_MODE_ALLOWED_COUNTRIES }

const CLOUDFLARE_TOR_COUNTRY = 'T1'
const CLOUDFLARE_ANONYMIZED_OR_UNKNOWN_COUNTRIES = new Set([
  CLOUDFLARE_TOR_COUNTRY,
  'XX',
])

export type FreeModeCountryBlockReason = FreebuffCountryBlockReason
export type FreeModeIpPrivacySignal = FreebuffIpPrivacySignal

export type FreeModeIpPrivacy = {
  signals: FreeModeIpPrivacySignal[]
  providerName?: string | null
  lastSeen?: string | null
  percentDaysSeen?: number | null
  /** ipinfo `as.type`: ISP, Hosting, Education, Government or Business.
   *  `hosting` is the only abuse-relevant class; see `isFreebuffBenignAsType`. */
  asType?: string | null
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
  scamalyticsIpPrivacy: FreeModeIpPrivacy | null
  scamalyticsStatus: FreebuffScamalyticsStatus
  scamalyticsScore: number | null
  scamalyticsRisk: string | null
  riskScore?: number | null
  hasClientIp: boolean
  clientIpHash: string | null
  /** Browser-supplied hints evaluation (web surface only). Downgrade-only:
   *  suspicious hints escalate to provider checks but never grant access. */
  clientHints?: ClientHintsEvaluation | null
}

export type LookupIpPrivacyFn = (
  ip: string,
) => Promise<FreeModeIpPrivacy | null>

export type LookupSpurIpPrivacyFn = (
  ip: string,
) => Promise<FreeModeIpPrivacy | null>

export type FreeModeScamalyticsIpRisk = FreeModeIpPrivacy & {
  score: number | null
  risk: string | null
}

export type LookupScamalyticsIpRiskFn = (
  ip: string,
) => Promise<FreeModeScamalyticsIpRisk | null>

export function getFreeModeAccessTier(
  countryAccess: Pick<FreeModeCountryAccess, 'allowed'>,
): FreebuffAccessTier {
  return countryAccess.allowed ? 'full' : 'limited'
}

export type FreeModeCountryAccessOptions = {
  lookupIpPrivacy?: LookupIpPrivacyFn
  lookupSpurIpPrivacy?: LookupSpurIpPrivacyFn
  lookupScamalyticsIpRisk?: LookupScamalyticsIpRiskFn
  fetch?: typeof globalThis.fetch
  ipinfoToken: string
  spurToken: string
  scamalyticsApiKey?: string
  scamalyticsUser?: string
  ipHashSecret?: string
  allowLocalhost?: boolean
  /** Debug escape hatch: when true (and `allowLocalhost` is also true),
   *  the localhost bypass returns `allowed: false` so callers exercise the
   *  limited Freebuff tier instead of full. Cache writes/reads are skipped
   *  for these requests (clientIpHash is nulled) so flipping the flag takes
   *  effect on the next request without manual cache eviction. */
  forceLimited?: boolean
  /** Optional client-supplied hints (browser timezone/languages). Spoofable,
   *  so they only escalate scrutiny — a clean IP verdict with suspicious
   *  hints triggers the Spur/Scamalytics second-opinion chain. They never
   *  upgrade a limited/blocked verdict. */
  clientHints?: ClientHintsInput | null
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
const scamalyticsPrivacyCache = new Map<
  string,
  { expiresAt: number; risk: FreeModeScamalyticsIpRisk | null }
>()

const SCAMALYTICS_DEFAULT_USER = 'codebuff'
export const SCAMALYTICS_LIMITED_RISK_SCORE = 50

// `relay` is intentionally absent: Apple iCloud Private Relay (and similar
// consumer relays) is a default privacy feature shipped to ordinary users, not
// an anonymizer abusers reach for. ipinfo additionally tags relay exits with
// `is_anonymous`/`is_hosting` (they ride on Akamai/Cloudflare), so we also
// suppress those companion signals in `privacySignalsFromIpinfo` — a relay user
// should never be dropped into limited mode.
const FREE_MODE_LIMITED_PRIVACY_SIGNALS = new Set<FreeModeIpPrivacySignal>([
  ...FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS,
  'anonymous',
  'hosting',
  'service',
])

export function hasHardBlockedPrivacySignal(
  ipPrivacy: FreeModeIpPrivacy | null | undefined,
): boolean {
  return ipPrivacy?.signals.some(isFreebuffHardBlockedPrivacySignal) ?? false
}

function hasTorPrivacySignal(
  ipPrivacy: FreeModeIpPrivacy | null | undefined,
): boolean {
  return ipPrivacy?.signals.includes('tor') ?? false
}

function hasResidentialProxySignal(
  ipPrivacy: FreeModeIpPrivacy | null | undefined,
): boolean {
  return ipPrivacy?.signals.includes('res_proxy') ?? false
}

function hasCorroboratedTorSignal(
  countryAccess: Partial<
    Pick<
      FreeModeCountryAccess,
      'ipPrivacy' | 'spurIpPrivacy' | 'scamalyticsIpPrivacy'
    >
  >,
): boolean {
  return (
    hasTorPrivacySignal(countryAccess.ipPrivacy) &&
    (hasTorPrivacySignal(countryAccess.spurIpPrivacy) ||
      hasTorPrivacySignal(countryAccess.scamalyticsIpPrivacy))
  )
}

function hasCorroboratedResidentialProxySignal(
  countryAccess: Partial<
    Pick<
      FreeModeCountryAccess,
      | 'ipPrivacy'
      | 'spurIpPrivacy'
      | 'scamalyticsIpPrivacy'
      | 'scamalyticsScore'
    >
  >,
): boolean {
  const ipinfoResidentialProxy = hasResidentialProxySignal(
    countryAccess.ipPrivacy,
  )
  const spurResidentialProxy = hasResidentialProxySignal(
    countryAccess.spurIpPrivacy,
  )
  const scamalyticsResidentialProxy = hasResidentialProxySignal(
    countryAccess.scamalyticsIpPrivacy,
  )
  const scamalyticsCorroborates =
    scamalyticsResidentialProxy ||
    hasHardBlockedPrivacySignal(countryAccess.scamalyticsIpPrivacy) ||
    (countryAccess.scamalyticsScore ?? 0) >= SCAMALYTICS_LIMITED_RISK_SCORE

  return (
    (ipinfoResidentialProxy && scamalyticsCorroborates) ||
    (spurResidentialProxy && scamalyticsCorroborates) ||
    (scamalyticsResidentialProxy &&
      (hasHardBlockedPrivacySignal(countryAccess.ipPrivacy) ||
        hasHardBlockedPrivacySignal(countryAccess.spurIpPrivacy)))
  )
}

const DAY_MS = 24 * 60 * 60 * 1000
const SEVEN_DAYS_MS = 7 * DAY_MS
const THIRTY_DAYS_MS = 30 * DAY_MS

/** Age of an ipinfo `last_seen` date in ms, or null if missing/unparseable. */
function lastSeenAgeMs(lastSeen: string | null | undefined): number | null {
  if (!lastSeen) return null
  const lastSeenMs = Date.parse(lastSeen)
  if (!Number.isFinite(lastSeenMs)) return null
  return Date.now() - lastSeenMs
}

// Standalone residential-proxy risk, on the same 0-100 scale as every other
// signal. Reference points it slots between: hosting/service=40, anonymous=55,
// vpn/proxy=70, no-provider-on-hosting=85, corroborated res_proxy/tor=95.
//
// `res_proxy` is deliberately NOT binary. Many ordinary users are proxied
// without knowing it (bundled SDKs, "free VPN" apps), so a hit on its own is
// real but weak evidence. We start from a low base and add risk for how
// recently (`last_seen`) and how often (`percent_days_seen` — how widely the IP
// is shared out) ipinfo has seen this IP acting as an exit: a fresh,
// frequently-shared IP is an actively-rented proxy and lands just under the
// corroborated tier (max 90), while a stale, rarely-seen one stays at the base.
// Cross-provider corroboration escalates separately to 95.
const RES_PROXY_BASE_RISK = 25
const RES_PROXY_RECENT_BONUS = 35 // last_seen within 7 days
const RES_PROXY_MEDIUM_BONUS = 18 // last_seen within 30 days
const RES_PROXY_MAX_FREQUENCY_BONUS = 30 // at percent_days_seen === 100

function residentialProxyRisk(
  ipPrivacy: Pick<FreeModeIpPrivacy, 'lastSeen' | 'percentDaysSeen'>,
): number {
  let risk = RES_PROXY_BASE_RISK
  const ageMs = lastSeenAgeMs(ipPrivacy.lastSeen)
  if (ageMs !== null) {
    if (ageMs <= SEVEN_DAYS_MS) risk += RES_PROXY_RECENT_BONUS
    else if (ageMs <= THIRTY_DAYS_MS) risk += RES_PROXY_MEDIUM_BONUS
  }
  const percentDaysSeen =
    typeof ipPrivacy.percentDaysSeen === 'number' &&
    Number.isFinite(ipPrivacy.percentDaysSeen)
      ? Math.min(100, Math.max(0, ipPrivacy.percentDaysSeen))
      : 0
  risk += (percentDaysSeen / 100) * RES_PROXY_MAX_FREQUENCY_BONUS
  return risk
}

function maxPrivacySignalRisk(
  ipPrivacy: FreeModeIpPrivacy | null | undefined,
): number {
  let risk = 0
  const signals = ipPrivacy?.signals ?? []
  // Metadata escalators below describe genuine, attributable anonymizers
  // (vpn/proxy/tor). `res_proxy` carries its own recency/frequency model and
  // `relay` is benign, so neither participates in these bumps.
  const hasNonResHardSignal = signals.some(
    (signal) =>
      signal !== 'res_proxy' && isFreebuffHardBlockedPrivacySignal(signal),
  )
  for (const signal of signals) {
    if (signal === 'tor') risk = Math.max(risk, 100)
    else if (signal === 'res_proxy' && ipPrivacy) {
      // ipPrivacy is non-null here (signal came from ipPrivacy.signals); the
      // guard just narrows the type for residentialProxyRisk's metadata access.
      risk = Math.max(risk, residentialProxyRisk(ipPrivacy))
    } else if (isFreebuffHardBlockedPrivacySignal(signal)) {
      risk = Math.max(risk, 70)
    } else if (signal === 'anonymous') {
      risk = Math.max(risk, 55)
    } else if (signal === 'hosting' || signal === 'service') {
      risk = Math.max(risk, 40)
    }
    // `relay` adds no risk — it's a green flag (see FREE_MODE_LIMITED_...).
  }
  if (hasNonResHardSignal) {
    // A named consumer VPN (e.g. "ProtonVPN") is the normal baseline.
    if (ipPrivacy?.providerName) {
      risk = Math.max(risk, 80)
    }
    // ...but an anonymizer with NO provider attribution running on a hosting
    // ASN (e.g. a VPN/proxy exit on AWS) is riskier than a normal consumer VPN.
    if (!ipPrivacy?.providerName && isFreebuffHostingAsType(ipPrivacy?.asType)) {
      risk = Math.max(risk, 85)
    }
    if (
      typeof ipPrivacy?.percentDaysSeen === 'number' &&
      ipPrivacy.percentDaysSeen >= 50
    ) {
      risk = Math.max(risk, 85)
    }
    const ageMs = lastSeenAgeMs(ipPrivacy?.lastSeen)
    if (ageMs !== null && ageMs <= SEVEN_DAYS_MS) {
      risk = Math.max(risk, 85)
    }
  }
  return risk
}

export function getFreeModeRiskScore(
  countryAccess: Pick<
    FreeModeCountryAccess,
    | 'blockReason'
    | 'cfCountry'
    | 'ipPrivacy'
    | 'spurIpPrivacy'
    | 'spurStatus'
    | 'scamalyticsIpPrivacy'
    | 'scamalyticsStatus'
    | 'scamalyticsScore'
    | 'riskScore'
  >,
): number {
  if (typeof countryAccess.riskScore === 'number') {
    return countryAccess.riskScore
  }

  if (countryAccess.cfCountry === CLOUDFLARE_TOR_COUNTRY) return 100

  let score = 0
  if (countryAccess.blockReason === 'country_not_allowed') score = 35
  if (
    countryAccess.blockReason === 'missing_client_ip' ||
    countryAccess.blockReason === 'unresolved_client_ip' ||
    countryAccess.blockReason === 'anonymized_or_unknown_country'
  ) {
    score = Math.max(score, 50)
  }
  if (countryAccess.blockReason === 'ip_privacy_lookup_failed') {
    score = Math.max(score, 55)
  }

  score = Math.max(score, maxPrivacySignalRisk(countryAccess.ipPrivacy))
  score = Math.max(score, maxPrivacySignalRisk(countryAccess.spurIpPrivacy))
  score = Math.max(
    score,
    maxPrivacySignalRisk(countryAccess.scamalyticsIpPrivacy),
  )
  if (countryAccess.spurStatus === 'failed') score = Math.max(score, 55)
  if (countryAccess.spurStatus === 'suspicious') score = Math.max(score, 75)
  if (countryAccess.scamalyticsStatus === 'failed') {
    score = Math.max(score, 55)
  }
  if (countryAccess.scamalyticsStatus === 'suspicious') {
    score = Math.max(
      score,
      countryAccess.scamalyticsScore ?? SCAMALYTICS_LIMITED_RISK_SCORE,
    )
  }
  if (typeof countryAccess.scamalyticsScore === 'number') {
    score = Math.max(score, countryAccess.scamalyticsScore)
  }
  if (hasCorroboratedTorSignal(countryAccess)) {
    score = Math.max(score, 95)
  }
  if (hasCorroboratedResidentialProxySignal(countryAccess)) {
    score = Math.max(score, 95)
  }

  return Math.min(100, Math.max(0, Math.round(score)))
}

export function shouldHardBlockFreeModeAccess(
  countryAccess: Pick<FreeModeCountryAccess, 'cfCountry'> &
    Partial<
      Pick<
        FreeModeCountryAccess,
        | 'blockReason'
        | 'ipPrivacy'
        | 'spurIpPrivacy'
        | 'scamalyticsIpPrivacy'
        | 'scamalyticsScore'
      >
    >,
): boolean {
  if (countryAccess.cfCountry === CLOUDFLARE_TOR_COUNTRY) return true
  if (countryAccess.blockReason !== 'anonymous_network') return false
  return (
    hasCorroboratedTorSignal(countryAccess) ||
    hasCorroboratedResidentialProxySignal(countryAccess)
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
    | 'scamalyticsIpPrivacy'
    | 'scamalyticsStatus'
    | 'scamalyticsScore'
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
    if (shouldHardBlockFreeModeAccess(countryAccess)) {
      return 'corroborated_block'
    }
    if (countryAccess.spurStatus === 'failed') {
      return 'spur_failed_limited'
    }
    if (countryAccess.scamalyticsStatus === 'failed') {
      return 'scamalytics_failed_limited'
    }
    if (countryAccess.scamalyticsStatus === 'suspicious') {
      return 'scamalytics_suspicious_limited'
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
    | 'scamalyticsStatus'
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
  if (countryAccess.scamalyticsStatus === 'failed') {
    return 'scamalytics_failed'
  }
  if (
    countryAccess.spurStatus === 'clean' &&
    countryAccess.scamalyticsStatus === 'suspicious'
  ) {
    return 'scamalytics_only'
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

export function extractClientIp(req: HeadersCarrier): string | undefined {
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

function setScamalyticsPrivacyCache(
  ip: string,
  risk: FreeModeScamalyticsIpRisk | null,
): void {
  while (scamalyticsPrivacyCache.size >= IPINFO_PRIVACY_CACHE_MAX_ENTRIES) {
    const oldestIp = scamalyticsPrivacyCache.keys().next().value
    if (!oldestIp) break
    scamalyticsPrivacyCache.delete(oldestIp)
  }

  scamalyticsPrivacyCache.set(ip, {
    expiresAt: Date.now() + IPINFO_PRIVACY_CACHE_TTL_MS,
    risk,
  })
}

function asTypeFromIpinfo(data: Record<string, unknown>): string | null {
  const as =
    data.as && typeof data.as === 'object'
      ? (data.as as Record<string, unknown>)
      : {}
  return typeof as.type === 'string' && as.type.length > 0
    ? as.type.toLowerCase()
    : null
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
  if (anonymous.is_res_proxy === true) signals.push('res_proxy')

  // Relay (Apple iCloud Private Relay etc.) is a green flag. ipinfo also sets
  // is_anonymous + is_hosting on relay exits because they ride on Akamai/
  // Cloudflare hosting, so emit ONLY `relay` and suppress those noisy companion
  // signals. Any genuine hard signal (vpn/proxy/tor/res_proxy) above still
  // stands and keeps the IP gated.
  if (data.relay === true || anonymous.is_relay === true) {
    signals.push('relay')
    return signals
  }

  // Hosting is suspect, but trust ipinfo's `as.type`: ISP/Business/Education/
  // Government networks are legitimate even if the coarse `is_hosting` flag is
  // set, so don't gate real users sitting behind them.
  const asType = asTypeFromIpinfo(data)
  if (
    (isFreebuffHostingAsType(asType) ||
      data.hosting === true ||
      data.is_hosting === true) &&
    !isFreebuffBenignAsType(asType)
  ) {
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

function privacyMetadataFromIpinfo(
  data: Record<string, unknown>,
): Pick<
  FreeModeIpPrivacy,
  'providerName' | 'lastSeen' | 'percentDaysSeen' | 'asType'
> {
  const anonymous =
    data.anonymous && typeof data.anonymous === 'object'
      ? (data.anonymous as Record<string, unknown>)
      : {}

  return {
    asType: asTypeFromIpinfo(data),
    providerName:
      typeof anonymous.name === 'string' && anonymous.name.length > 0
        ? anonymous.name
        : typeof data.service === 'string' && data.service.length > 0
          ? data.service
          : null,
    lastSeen:
      typeof anonymous.last_seen === 'string' && anonymous.last_seen.length > 0
        ? anonymous.last_seen
        : null,
    percentDaysSeen:
      typeof anonymous.percent_days_seen === 'number' &&
      Number.isFinite(anonymous.percent_days_seen)
        ? anonymous.percent_days_seen
        : null,
  }
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

function pushScamalyticsProxyType(
  signals: FreeModeIpPrivacySignal[],
  proxyType: unknown,
  includeGenericProxy: boolean,
): void {
  if (typeof proxyType !== 'string') return
  const normalized = proxyType.toUpperCase()
  if (normalized === 'TOR') {
    pushUniqueSignal(signals, 'tor')
  } else if (normalized === 'VPN') {
    pushUniqueSignal(signals, 'vpn')
  } else if (
    includeGenericProxy &&
    (normalized === 'PUB' ||
      normalized === 'WEB' ||
      normalized.includes('PROXY'))
  ) {
    pushUniqueSignal(signals, 'proxy')
  } else if (normalized === 'DCH' || normalized === 'SES') {
    pushUniqueSignal(signals, 'hosting')
  }
}

function scamalyticsRoot(
  data: Record<string, unknown>,
): Record<string, unknown> {
  return data.scamalytics && typeof data.scamalytics === 'object'
    ? (data.scamalytics as Record<string, unknown>)
    : data
}

function numberFromScamalyticsValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

export function privacySignalsFromScamalytics(
  data: Record<string, unknown>,
): FreeModeIpPrivacySignal[] {
  const root = scamalyticsRoot(data)
  const signals: FreeModeIpPrivacySignal[] = []
  const proxy =
    root.scamalytics_proxy && typeof root.scamalytics_proxy === 'object'
      ? (root.scamalytics_proxy as Record<string, unknown>)
      : {}

  if (proxy.is_vpn === true) pushUniqueSignal(signals, 'vpn')
  if (proxy.is_tor === true) pushUniqueSignal(signals, 'tor')
  if (proxy.is_proxy === true || proxy.is_public_proxy === true) {
    pushUniqueSignal(signals, 'proxy')
  }
  if (proxy.is_web_proxy === true) pushUniqueSignal(signals, 'proxy')
  if (proxy.is_residential_proxy === true || proxy.is_res_proxy === true) {
    pushUniqueSignal(signals, 'res_proxy')
  }
  if (proxy.is_apple_icloud_private_relay === true) {
    pushUniqueSignal(signals, 'relay')
  }
  if (
    proxy.is_datacenter === true ||
    proxy.is_amazon_aws === true ||
    proxy.is_google === true
  ) {
    pushUniqueSignal(signals, 'hosting')
  }

  const external =
    data.external_datasources && typeof data.external_datasources === 'object'
      ? (data.external_datasources as Record<string, unknown>)
      : {}
  for (const source of Object.values(external)) {
    if (!source || typeof source !== 'object') continue
    const sourceRecord = source as Record<string, unknown>
    if (sourceRecord.is_vpn === true) pushUniqueSignal(signals, 'vpn')
    if (sourceRecord.is_tor === true) pushUniqueSignal(signals, 'tor')
    if (sourceRecord.is_datacenter === true) {
      pushUniqueSignal(signals, 'hosting')
    }
    pushScamalyticsProxyType(signals, sourceRecord.proxy_type, false)
    pushScamalyticsProxyType(signals, sourceRecord.usage_type, false)
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
    ...privacyMetadataFromIpinfo(data),
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

export async function lookupScamalyticsIpRisk(params: {
  ip: string
  user?: string
  apiKey: string
  fetch: typeof globalThis.fetch
}): Promise<FreeModeScamalyticsIpRisk | null> {
  const cached = scamalyticsPrivacyCache.get(params.ip)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.risk
  }

  if (!params.apiKey) return null

  const user = params.user ?? SCAMALYTICS_DEFAULT_USER
  const response = await params.fetch(
    `https://api11.scamalytics.com/v3/${encodeURIComponent(
      user,
    )}/?key=${encodeURIComponent(params.apiKey)}&ip=${encodeURIComponent(
      params.ip,
    )}`,
  )
  if (!response.ok) {
    return null
  }

  const data = (await response.json()) as Record<string, unknown>
  const root = scamalyticsRoot(data)
  if (root.status && root.status !== 'ok') {
    return null
  }

  const risk = {
    signals: privacySignalsFromScamalytics(data),
    score:
      numberFromScamalyticsValue(root.scamalytics_score) ??
      numberFromScamalyticsValue(root.score),
    risk:
      typeof root.scamalytics_risk === 'string'
        ? root.scamalytics_risk
        : typeof root.risk === 'string'
          ? root.risk
          : null,
  }
  setScamalyticsPrivacyCache(params.ip, risk)
  return risk
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

async function lookupScamalyticsStatus(
  clientIp: string,
  options: FreeModeCountryAccessOptions,
): Promise<{
  risk: FreeModeScamalyticsIpRisk | null
  status: FreebuffScamalyticsStatus
}> {
  try {
    const risk = options.lookupScamalyticsIpRisk
      ? await options.lookupScamalyticsIpRisk(clientIp)
      : await lookupScamalyticsIpRisk({
          ip: clientIp,
          user: options.scamalyticsUser,
          apiKey: options.scamalyticsApiKey ?? '',
          fetch: options.fetch ?? globalThis.fetch,
        })
    if (!risk) return { risk: null, status: 'failed' }
    const score = risk.score ?? 0
    return {
      risk,
      status:
        hasHardBlockedPrivacySignal(risk) ||
        score >= SCAMALYTICS_LIMITED_RISK_SCORE
          ? 'suspicious'
          : 'clean',
    }
  } catch {
    return { risk: null, status: 'failed' }
  }
}

const NOT_CHECKED_SPUR_CONTEXT = {
  spurIpPrivacy: null,
  spurStatus: 'not_checked' as const,
}

const NOT_CHECKED_SCAMALYTICS_CONTEXT = {
  scamalyticsIpPrivacy: null,
  scamalyticsStatus: 'not_checked' as const,
  scamalyticsScore: null,
  scamalyticsRisk: null,
}

export async function getFreeModeCountryAccess(
  req: HeadersCarrier,
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
        ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
        hasClientIp: Boolean(clientIp),
        // Null hash skips the country-access cache so toggling the force flag
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
      hasClientIp: false,
      clientIpHash,
    }
  } else {
    // Loaded lazily: geoip-country reads its country database (~19 MB RSS)
    // into memory at require time, and this fallback is only reachable when
    // Cloudflare's cf-ipcountry header is absent — never in production
    // behind Cloudflare.
    const { default: geoip } = await import('geoip-country')
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
        ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
        hasClientIp: true,
        clientIpHash,
      }
    }

    baseAccess = {
      countryCode: geoipCountry,
      cfCountry: null,
      geoipCountry,
      ...NOT_CHECKED_SPUR_CONTEXT,
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
      hasClientIp: true,
      clientIpHash,
    }
  }

  const clientHints = options.clientHints
    ? evaluateClientHints({
        ...options.clientHints,
        ipCountryCode: baseAccess.countryCode,
      })
    : null

  if (!FREE_MODE_ALLOWED_COUNTRIES.has(baseAccess.countryCode)) {
    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'country_not_allowed',
      ipPrivacy: null,
      ...NOT_CHECKED_SPUR_CONTEXT,
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
      clientIpHash,
      clientHints,
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
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
      ...NOT_CHECKED_SCAMALYTICS_CONTEXT,
      clientIpHash,
      clientHints,
    }
  }

  if (
    ipPrivacy.signals.some((signal) =>
      FREE_MODE_LIMITED_PRIVACY_SIGNALS.has(signal),
    )
  ) {
    const [
      { privacy: spurIpPrivacy, status: spurStatus },
      { risk: scamalyticsIpRisk, status: scamalyticsStatus },
    ] = await Promise.all([
      lookupSpurPrivacyStatus(clientIp, options),
      lookupScamalyticsStatus(clientIp, options),
    ])
    const scamalyticsContext = {
      scamalyticsIpPrivacy: scamalyticsIpRisk
        ? { signals: scamalyticsIpRisk.signals }
        : null,
      scamalyticsStatus,
      scamalyticsScore: scamalyticsIpRisk?.score ?? null,
      scamalyticsRisk: scamalyticsIpRisk?.risk ?? null,
    }

    // Hard IPinfo signals (vpn/proxy/tor/res_proxy) are genuine anonymizer
    // detections: keep the strict rule that a second opinion must affirmatively
    // clear the IP, so a provider being down does NOT let real VPN traffic in.
    //
    // Soft-only signals (relay/hosting/anonymous/service) are noisy and
    // false-positive prone — `relay` is Apple iCloud Private Relay (a default
    // consumer feature) and `hosting` catches legit cloud dev environments.
    // For those we only downgrade when a provider AFFIRMATIVELY flags the IP as
    // suspicious; a `failed`/unavailable provider no longer blocks the user.
    // This keeps legitimate users in allowed countries out of limited mode when
    // a second-opinion provider (e.g. Scamalytics) is unavailable.
    const ipinfoHasHardSignal = hasHardBlockedPrivacySignal(ipPrivacy)
    const cleared = ipinfoHasHardSignal
      ? spurStatus === 'clean' || scamalyticsStatus === 'clean'
      : spurStatus !== 'suspicious' && scamalyticsStatus !== 'suspicious'

    if (cleared) {
      return {
        ...baseAccess,
        allowed: true,
        blockReason: null,
        ipPrivacy,
        spurIpPrivacy,
        spurStatus,
        ...scamalyticsContext,
        clientIpHash,
        clientHints,
      }
    }

    return {
      ...baseAccess,
      allowed: false,
      blockReason: 'anonymous_network',
      ipPrivacy,
      spurIpPrivacy,
      spurStatus,
      ...scamalyticsContext,
      clientIpHash,
      clientHints,
    }
  }

  // IPinfo is clean, but client-supplied hints (browser timezone/languages)
  // look inconsistent with the IP country — escalate to the second-opinion
  // providers. Spur is strong on exactly this case: residential VPN exits
  // IPinfo misses. Either provider flagging the IP downgrades to limited;
  // provider failures do NOT downgrade here since the primary verdict was
  // clean and hints are client-controlled.
  if (clientHints?.suspicious) {
    const [
      { privacy: spurIpPrivacy, status: spurStatus },
      { risk: scamalyticsIpRisk, status: scamalyticsStatus },
    ] = await Promise.all([
      lookupSpurPrivacyStatus(clientIp, options),
      lookupScamalyticsStatus(clientIp, options),
    ])
    const scamalyticsContext = {
      scamalyticsIpPrivacy: scamalyticsIpRisk
        ? { signals: scamalyticsIpRisk.signals }
        : null,
      scamalyticsStatus,
      scamalyticsScore: scamalyticsIpRisk?.score ?? null,
      scamalyticsRisk: scamalyticsIpRisk?.risk ?? null,
    }

    if (spurStatus === 'suspicious' || scamalyticsStatus === 'suspicious') {
      return {
        ...baseAccess,
        allowed: false,
        blockReason: 'anonymous_network',
        ipPrivacy,
        spurIpPrivacy,
        spurStatus,
        ...scamalyticsContext,
        clientIpHash,
        clientHints,
      }
    }

    return {
      ...baseAccess,
      allowed: true,
      blockReason: null,
      ipPrivacy,
      spurIpPrivacy,
      spurStatus,
      ...scamalyticsContext,
      clientIpHash,
      clientHints,
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
    clientHints,
  }
}
