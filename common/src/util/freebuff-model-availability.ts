/**
 * One line answering "why these models?" for a user whose account resolved to
 * the reduced catalog.
 *
 * Tone matters here: this is shown to users who, through no fault of their own,
 * get the smaller model set. Frame it as model *availability* ("aren't
 * available in BR yet"), never as restricted *access* ("limited mode",
 * "blocked") — clear enough to answer the question for someone who goes
 * looking, quiet enough to ignore for someone who doesn't. The VPN case is the
 * one the user can act on, so it leads with the action.
 *
 * Shared by the CLI landing picker and the Desktop model menu so the two
 * surfaces cannot drift — a user who reads it in one and asks support about the
 * other should be told the same thing.
 */

import type {
  FreebuffIpPrivacySignal,
  FreebuffLimitedModeReason,
} from '../types/freebuff-session'

/**
 * Why DeepSeek V4 Flash 07/31 is missing from the reduced catalog, rendered
 * under the model list on all three pickers alongside the availability notice
 * below: that line explains the smaller catalog, this one explains a model that
 * used to be in it. Names the dated build, matching the display name of the row
 * that is now gone — unlike every other notice, its subject is not on screen.
 *
 * Kept to three clauses because it wraps under the picker, and delete it when
 * Flash returns to LIMITED_FREEBUFF_MODEL_IDS.
 */
export const FREEBUFF_PAUSED_MODEL_NOTICE =
  "DeepSeek V4 Flash 07/31 is paused here after a steep price increase — pausing it is what keeps these sessions free for everyone. We're working to bring it back."

/**
 * The limits, in three clauses and a signature.
 *
 * SHORT ON PURPOSE. This replaced a version that listed every rule — per-model
 * caps, peak hours, quantization, which pool each row spends — and was four
 * lines deep in a dropdown. Users skim a picker; a paragraph there is read by
 * nobody, so the details it carried reached fewer people than the summary does.
 * The picker itself shows each row's own count, which is where a user looks
 * when they want the specifics.
 *
 * Keep it to: why, what the limit is, what is still free. Anything more belongs
 * on the rows.
 *
 * Signed, because this is us asking users to accept less than they had. An
 * unsigned notice reads as a system message; a signed one reads as someone
 * taking responsibility for it, which is the honest framing when the cause is
 * our costs rather than anything they did.
 */
export const FREEBUFF_TIER_CHANGE_NOTICE =
  'DeepSeek costs have spiked, so limits are tighter for now: V4 Pro and GPT-5.6 Luna are 1 session a day, V4 Pro pauses at peak times, and MiniMax M3 is unavailable. MiMo 2.5 stays unlimited. —Freebuff Team'

const PRIVACY_SIGNAL_LABELS: Partial<Record<FreebuffIpPrivacySignal, string>> =
  {
    anonymous: 'anonymized network',
    proxy: 'proxy',
    relay: 'relay',
    res_proxy: 'residential proxy',
    tor: 'Tor',
    vpn: 'VPN',
    hosting: 'hosting network',
    service: 'privacy service',
  }

export function formatFreebuffPrivacySignalList(
  signals: readonly FreebuffIpPrivacySignal[] | null | undefined,
): string {
  const labels = Array.from(
    new Set(
      signals
        ?.map((signal) => PRIVACY_SIGNAL_LABELS[signal])
        .filter((label): label is string => Boolean(label)) ?? [],
    ),
  )

  if (labels.length === 0) {
    return 'VPN, Tor, proxy, relay, or anonymized network'
  }
  if (labels.length === 1) return labels[0]
  if (labels.length === 2) return `${labels[0]} or ${labels[1]}`
  return `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`
}

/** "BR" → "Brazil". Falls back to the raw code when the runtime can't
 *  resolve it (malformed code, missing ICU data). */
export function formatFreebuffCountryName(countryCode: string): string {
  try {
    return (
      new Intl.DisplayNames(['en'], { type: 'region' }).of(countryCode) ??
      countryCode
    )
  } catch {
    return countryCode
  }
}

/**
 * The one line to render next to the model list. Callers gate on the access
 * tier: a full-access account has the whole catalog and needs no explanation.
 *
 * A missing/unknown reason still returns a line — the reduced catalog is
 * visible either way, so saying nothing is the one option that leaves the
 * question unanswered.
 */
export function getFreebuffModelAvailabilityNotice(
  reason: FreebuffLimitedModeReason | null | undefined,
): string {
  const generic = "Some models aren't available on this connection"
  if (!reason) return generic

  const countryCode =
    reason.countryCode && reason.countryCode !== 'UNKNOWN'
      ? reason.countryCode
      : null

  switch (reason.countryBlockReason) {
    case 'anonymous_network':
      return `Using a ${formatFreebuffPrivacySignalList(
        reason.ipPrivacySignals,
      )}? More models are available on a direct connection`
    case 'country_not_allowed':
      return `Some models aren't available in ${
        countryCode ? formatFreebuffCountryName(countryCode) : 'your region'
      } yet`
    case 'anonymized_or_unknown_country':
    case 'missing_client_ip':
    case 'unresolved_client_ip':
      return "We couldn't confirm your region, so we're showing models available everywhere"
    case 'ip_privacy_lookup_failed':
      return "We couldn't finish a network check, so we're showing models available everywhere"
    default:
      return generic
  }
}
