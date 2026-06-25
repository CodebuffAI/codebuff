import type { FreebuffIpPrivacySignal } from '../types/freebuff-session'

export const FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS = [
  'vpn',
  'proxy',
  'tor',
  'res_proxy',
] as const satisfies readonly FreebuffIpPrivacySignal[]

type FreebuffHardBlockedPrivacySignal =
  (typeof FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS)[number]

const FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNAL_SET =
  new Set<FreebuffIpPrivacySignal>(FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNALS)

const FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNAL_LABELS: Record<
  FreebuffHardBlockedPrivacySignal,
  string
> = {
  vpn: 'VPN',
  proxy: 'proxy',
  res_proxy: 'proxy',
  tor: 'Tor',
}

export function isFreebuffHardBlockedPrivacySignal(
  signal: FreebuffIpPrivacySignal,
): signal is FreebuffHardBlockedPrivacySignal {
  return FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNAL_SET.has(signal)
}

/**
 * ipinfo's `as.type` classifies the owning ASN as one of: ISP, Hosting,
 * Education, Government or Business (see ipinfo's "IPinfo Plus" sample DB).
 * Only `hosting` is a meaningful abuse signal — that's where VPN/proxy exits
 * and bot infrastructure live. The other classes are ordinary networks real
 * users sit behind, so we treat them as benign even when other heuristics
 * (e.g. ipinfo's `is_hosting` flag) would otherwise fire.
 */
const FREEBUFF_BENIGN_AS_TYPES = new Set([
  'isp',
  'business',
  'education',
  'government',
])

export function isFreebuffBenignAsType(
  asType: string | null | undefined,
): boolean {
  return asType != null && FREEBUFF_BENIGN_AS_TYPES.has(asType.toLowerCase())
}

export function isFreebuffHostingAsType(
  asType: string | null | undefined,
): boolean {
  return typeof asType === 'string' && asType.toLowerCase() === 'hosting'
}

export function formatFreebuffHardBlockedPrivacySignals(
  signals: readonly FreebuffIpPrivacySignal[] | null | undefined,
): string {
  const labels = Array.from(
    new Set(
      (signals ?? []).flatMap((signal): string[] => {
        if (!isFreebuffHardBlockedPrivacySignal(signal)) return []
        return [FREEBUFF_HARD_BLOCKED_PRIVACY_SIGNAL_LABELS[signal]]
      }),
    ),
  )

  if (labels.length === 0) return 'VPN, proxy, or Tor'
  if (labels.length === 1) return labels[0]
  return `${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}`
}

export function formatFreebuffHardBlockedMessage(
  signals: readonly FreebuffIpPrivacySignal[] | null | undefined,
): string {
  return `Freebuff cannot be used from ${formatFreebuffHardBlockedPrivacySignals(
    signals,
  )} traffic. Please disable it and try again.`
}
