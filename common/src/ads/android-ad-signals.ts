/**
 * The consent rule for the Android app's extra ad signals: the bucketed
 * `client_context` it sends with an auction and the `landing` block of its
 * engagement record. Serving an ad and counting its impression and click are
 * not covered by this rule; they run for everyone.
 *
 * Outside the EEA, the UK and Switzerland the signals are collected without a
 * prompt (disclosed in the Play Data Safety form and the privacy policy).
 * Inside them, reading device state for advertising needs the user's consent
 * (ePrivacy Art. 5(3)), so the app asks once and sends nothing until the user
 * agrees. An unresolved country counts as inside: not knowing where someone
 * is is not a basis for collecting.
 *
 * The app applies the rule before it reads anything; the server applies it
 * again by the edge's country, so an old build or a wrong SIM hint cannot
 * store what the rule forbids.
 */

/** The app's report of the user's choice. Absent means `unknown`. */
export const AD_SIGNALS_CONSENT_HEADER = 'x-freebuff-ad-signals'
export const AD_SIGNALS_CONSENT_VALUES = [
  'granted',
  'denied',
  'unknown',
] as const
export type AdSignalsConsent = (typeof AD_SIGNALS_CONSENT_VALUES)[number]

/**
 * EEA (27) + the EFTA members of the EEA (IS, LI, NO) + UK + CH, ISO 3166-1
 * alpha-2 upper case. The same set the placements identity match gates on
 * (`IDENTITY_GATED_COUNTRIES`); kept here because `common` cannot import the
 * web app.
 */
export const AD_SIGNALS_CONSENT_COUNTRIES: ReadonlySet<string> = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
  'IS',
  'LI',
  'NO',
  'GB',
  'CH',
])

export function readAdSignalsConsent(
  value: string | null | undefined,
): AdSignalsConsent {
  const normalized = value?.trim().toLowerCase()
  return normalized === 'granted' || normalized === 'denied'
    ? normalized
    : 'unknown'
}

/**
 * Whether the extra signals may be collected and stored. A `denied` choice is
 * honoured everywhere; inside the consent region (or with no country) only
 * `granted` allows them.
 */
export function adSignalsAllowed(params: {
  country: string | null | undefined
  consent: AdSignalsConsent
}): boolean {
  if (params.consent === 'denied') return false
  if (params.consent === 'granted') return true
  const country = params.country?.trim().toUpperCase()
  if (!country) return false
  return !AD_SIGNALS_CONSENT_COUNTRIES.has(country)
}
