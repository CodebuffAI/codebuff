import ct from 'countries-and-timezones'

import { FREE_MODE_ALLOWED_COUNTRIES } from './allowed-countries'

/**
 * Browser-supplied detection hints. All values are client-controlled and
 * therefore spoofable: an evaluation may only ever escalate scrutiny or
 * downgrade access — never grant it. A user spoofing "US-looking" hints
 * gains nothing because the IP pipeline still decides.
 */
export type ClientHintsInput = {
  /** IANA timezone, e.g. `Intl.DateTimeFormat().resolvedOptions().timeZone` */
  timezone?: string | null
  /** `new Date().getTimezoneOffset()` — minutes behind UTC (positive west) */
  tzOffsetMinutes?: number | null
  /** BCP-47 locales from `navigator.languages` / `Accept-Language` */
  languages?: string[] | null
}

export type ClientHintsReason =
  | 'timezone_country_mismatch'
  | 'offset_zone_mismatch'
  | 'language_country_mismatch'

export type ClientHintsEvaluation = {
  suspicious: boolean
  timezone: string | null
  /** Country the reported timezone maps to (first match), if resolvable */
  hintCountry: string | null
  languages: string[] | null
  reasons: ClientHintsReason[]
}

function countriesForTimezone(timezone: string): string[] {
  const zone = ct.getTimezone(timezone)
  return zone?.countries ?? []
}

function offsetMatchesZone(timezone: string, tzOffsetMinutes: number): boolean {
  const zone = ct.getTimezone(timezone)
  if (!zone) return true // unknown zone is handled by the timezone check
  // JS getTimezoneOffset() is minutes *behind* UTC; zone offsets are minutes
  // *ahead* of UTC. Accept either standard or DST offset.
  const reported = -tzOffsetMinutes
  return reported === zone.utcOffset || reported === zone.dstOffset
}

function regionFromLocale(locale: string): string | null {
  const parts = locale.trim().split(/[-_]/)
  for (let i = 1; i < parts.length; i++) {
    const part = parts[i]
    if (/^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
  }
  return null
}

/**
 * Evaluates browser hints against the IP-derived country. Anchored on the
 * timezone signal: language mismatches alone never flag (travelers/expats),
 * they only corroborate a timezone mismatch. An offset that contradicts the
 * claimed zone is a standalone spoof tell.
 */
export function evaluateClientHints(
  input: ClientHintsInput & { ipCountryCode: string | null },
): ClientHintsEvaluation {
  const timezone = input.timezone?.trim() || null
  const languages =
    input.languages
      ?.map((language) => language.trim())
      .filter((language) => language.length > 0)
      .slice(0, 5) ?? null
  const reasons: ClientHintsReason[] = []

  const zoneCountries = timezone ? countriesForTimezone(timezone) : []
  const hintCountry = zoneCountries[0] ?? null

  const ipAllowed = input.ipCountryCode
    ? FREE_MODE_ALLOWED_COUNTRIES.has(input.ipCountryCode)
    : false

  // Timezone maps to only non-allowlisted countries while the IP claims an
  // allowlisted one (e.g. US IP + Asia/Kolkata clock).
  const timezoneMismatch =
    ipAllowed &&
    zoneCountries.length > 0 &&
    !zoneCountries.some((country) => FREE_MODE_ALLOWED_COUNTRIES.has(country))
  if (timezoneMismatch) {
    reasons.push('timezone_country_mismatch')
  }

  // The reported UTC offset contradicts the reported IANA zone — only a
  // spoofed environment produces this combination.
  if (
    timezone &&
    typeof input.tzOffsetMinutes === 'number' &&
    Number.isFinite(input.tzOffsetMinutes) &&
    !offsetMatchesZone(timezone, input.tzOffsetMinutes)
  ) {
    reasons.push('offset_zone_mismatch')
  }

  // Every reported locale with a region subtag points at non-allowlisted
  // countries. Recorded always; counts toward `suspicious` only alongside a
  // timezone mismatch so language alone never flags.
  if (ipAllowed && languages && languages.length > 0) {
    const regions = languages
      .map(regionFromLocale)
      .filter((region): region is string => region !== null)
    if (
      regions.length > 0 &&
      !regions.some((region) => FREE_MODE_ALLOWED_COUNTRIES.has(region))
    ) {
      reasons.push('language_country_mismatch')
    }
  }

  const suspicious =
    reasons.includes('timezone_country_mismatch') ||
    reasons.includes('offset_zone_mismatch')

  return {
    suspicious,
    timezone,
    hintCountry,
    languages,
    reasons,
  }
}
