/**
 * Classify email domains that referral-abuse detection treats as flags.
 *
 * Two categories, kept separate because they carry different weight:
 *
 * - `disposable` — one-time / throwaway inbox providers. A real person has no
 *   reason to sign up for a durable dev-tool account with an inbox that stops
 *   existing in an hour, so a *referred* account on one of these is a strong
 *   farm signal.
 * - `privacy_relay` — burner-friendly privacy providers and relays
 *   (Proton, Apple private relay, Firefox Relay, SimpleLogin, …). Plenty of
 *   legitimate developers live on these, so a hit is corroborating evidence
 *   only — it must never gate a reward or trigger action on its own.
 *
 * Matching is by exact domain or any subdomain (disposable providers hand out
 * wildcard subdomains). Lists are deliberately curated and small: they exist
 * to catch the providers we actually see in referral farms, not to be a
 * complete registry. Extend them as sweeps surface new ones (note the dated
 * "observed in referral farms" block below).
 */

export type FlaggedEmailDomainKind = 'disposable' | 'privacy_relay'

const DISPOSABLE_EMAIL_DOMAINS = [
  // Classic one-time inbox providers.
  '10minutemail.com',
  'dispostable.com',
  'dropmail.me',
  'emailondeck.com',
  'fakeinbox.com',
  'getnada.com',
  'grr.la',
  'guerrillamail.com',
  'guerrillamail.net',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mail.tm',
  'minuteinbox.com',
  'mintemail.com',
  'mohmal.com',
  'sharklasers.com',
  'temp-mail.org',
  'tempinbox.com',
  'tempmail.com',
  'tempmail.dev',
  'throwawaymail.com',
  'trashmail.com',
  'yopmail.com',
  // Observed in Freebuff referral farms, 2026-07 (scripted rings minting
  // referred accounts on niche throwaway domains — see the 07-29 sock sweep).
  'aifotoeditor.com',
  'animateany.com',
  'animatimg.com',
  'biscoito.email',
  'oldtranslator.com',
] as const

const PRIVACY_RELAY_EMAIL_DOMAINS = [
  // Proton family.
  'proton.me',
  'protonmail.ch',
  'protonmail.com',
  'passmail.net',
  'pm.me',
  // Apple "Hide My Email".
  'privaterelay.appleid.com',
  // DuckDuckGo Email Protection.
  'duck.com',
  // Firefox Relay.
  'mozmail.com',
  // Alias/relay services.
  'aleeas.com',
  'anonaddy.me',
  'simplelogin.com',
  'simplelogin.io',
  // Tutanota family.
  'tuta.com',
  'tuta.io',
  'tutamail.com',
  'tutanota.com',
] as const

const DISPOSABLE_SET: ReadonlySet<string> = new Set(DISPOSABLE_EMAIL_DOMAINS)
const PRIVACY_RELAY_SET: ReadonlySet<string> = new Set(
  PRIVACY_RELAY_EMAIL_DOMAINS,
)

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@')
  if (at < 0 || at === email.length - 1) return null
  return email.slice(at + 1).trim().toLowerCase()
}

function matchesSet(domain: string, set: ReadonlySet<string>): boolean {
  if (set.has(domain)) return true
  // Subdomain match: a.b.mailinator.com → b.mailinator.com → mailinator.com
  let rest = domain
  for (let dot = rest.indexOf('.'); dot >= 0; dot = rest.indexOf('.')) {
    rest = rest.slice(dot + 1)
    if (set.has(rest)) return true
  }
  return false
}

/** The flag category for `email`'s domain, or null for an ordinary domain
 *  (or an unparseable email). */
export function classifyEmailDomain(
  email: string | null | undefined,
): FlaggedEmailDomainKind | null {
  if (!email) return null
  const domain = domainOf(email)
  if (!domain) return null
  if (matchesSet(domain, DISPOSABLE_SET)) return 'disposable'
  if (matchesSet(domain, PRIVACY_RELAY_SET)) return 'privacy_relay'
  return null
}
