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
 * What changed for FULL-access users, rendered under the model list on every
 * picker. Two things, and they are separate facts: V4 Flash moved onto the
 * daily session pool it used to sit outside, and the DeepSeek builds we serve
 * are currently quantized.
 *
 * Distinct from FREEBUFF_PAUSED_MODEL_NOTICE above, which explains the reduced
 * LIMITED catalog. Both can be true at once, on different accounts, and a
 * limited-tier user must not be told about a premium pool they do not have.
 *
 * "may run" on the quantization, not "runs", because it is true of the CrofAI
 * lane and not of DeepSeek's own API, and which one answers a given turn is a
 * routing decision the user cannot see. Overstating it would be the easier
 * sentence and the false one.
 *
 * Says the word "temporary" and names what is still unlimited. Those two
 * clauses are the ones that matter: without the first this reads as the new
 * permanent shape of the free tier, and without the second a user whose pool is
 * spent has no idea there is anything left to run. Same framing rule as the
 * notice above — model AVAILABILITY, never restricted access, and no hint of
 * what any of it costs us (this file ships in the public export).
 *
 * DELETE THIS when Flash leaves FREEBUFF_PREMIUM_MODEL_IDS and the DeepSeek
 * lanes are back on full precision — it is the only piece of any of this that a
 * user ever reads.
 */
export const FREEBUFF_TIER_CHANGE_NOTICE =
  'Temporary while upstream prices are high: DeepSeek V4 Flash now uses a daily session, and DeepSeek models may run a quantized (Q8_0) build to keep costs down. MiMo 2.5 stays unlimited.'

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
