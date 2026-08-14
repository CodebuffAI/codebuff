/**
 * Per-account daily spend ceilings for free mode.
 *
 * These replace the flat `FREEBUFF_DAILY_SPEND_LIMIT_USD = 50` that every
 * account shared. A ceiling is the settled provider cost, since midnight
 * Pacific, at or above which no FRESH session is admitted — live sessions and
 * reclaims are never interrupted, so the honest reading is "how much we will
 * spend STARTING new work for this account today".
 *
 * ## Why a ceiling and not a ban
 *
 * Everything here is a spend cap, and that is deliberate. A cap is reversible,
 * proportionate, self-limiting, and wrong-in-a-cheap-way: a real user who hits
 * one loses the ability to start a new session today, not their account.
 * `docs/freebuff-abuse-detection.md` records what the other kind of error
 * costs — 659 accounts wrongly banned on 2026-08-03, reversed by hand — and
 * its evidence standard names region, domain, cost and volume as **weak**
 * signals that must never carry a ban alone. Every cohort below is built from
 * exactly those weak signals, so every cohort below gets a cap.
 *
 * Bans still happen. They happen through the sweeps, on the strong evidence
 * those sweeps re-derive (proxy fanout, honeypot hits), and a low ceiling is
 * what bounds the damage in the meantime.
 *
 * ## The ceilings compose by MINIMUM
 *
 * An account can be in several cohorts at once — a limited-region account on a
 * disposable domain running a third-party client. Rather than ordering the
 * rules and picking the first match, every applicable ceiling is computed and
 * the lowest wins. That makes the outcome independent of rule order, which is
 * the property that stops this file rotting as cohorts are added.
 *
 * It also means these can only ever LOWER a limit. The trust-level matrix
 * (`freebuff-trust.ts`) participates in the same minimum when it is enforcing,
 * so shipping these ceilings cannot accidentally raise anyone's budget while
 * that rollout is still in `observe`.
 */

import type { FreebuffAccessTier } from './freebuff-models'

/**
 * Region ceilings, replacing the flat $50.
 *
 * Sized against the measured per-user daily distribution rather than picked:
 * ordinary use sits far below these, and the accounts they bind are the tail
 * that made the flat cap meaningless. The limited region is lower because it
 * cannot reach a premium model at all, so the same dollar figure buys far more
 * requests there — an identical cap would not be an identical constraint.
 */
export const FREEBUFF_REGION_DAILY_SPEND_USD: Record<
  FreebuffAccessTier,
  number
> = {
  full: 15,
  limited: 5,
}

/**
 * The restricted-cohort ceiling.
 *
 * Deliberately not zero. A zero ceiling is a block, and a block tells the
 * operator instantly which signal caught them — at which point they rotate it
 * and we lose both the account and the detection. Fifty cents a day keeps them
 * visible, keeps their traffic flowing through the honeypot models and the
 * fanout counters that produce ban-grade evidence, and costs about as much as
 * finding out would have.
 *
 * Note what this does and does not bound. It gates whether a FRESH session may
 * start, so an account at $0.49 can still open one and spend well past the
 * ceiling inside it — live sessions are never interrupted, by design. The
 * ceiling therefore caps how often restricted accounts come back, not their
 * worst single day. At $0.50 that is roughly one session and then nothing more
 * until the Pacific-midnight reset.
 *
 * This is the same reasoning `docs/freebuff-honeypot-models.md` gives for
 * separating detection from enforcement in time.
 */
export const FREEBUFF_RESTRICTED_DAILY_SPEND_USD = 0.5

/**
 * Countries whose free-mode accounts are held at the restricted ceiling.
 *
 * **This is a spend cap on a region, not a judgement about people in it, and
 * it is worth being precise about what it can and cannot do.** Both of these
 * are among the largest VPN and datacenter exit geographies in the world, so a
 * meaningful share of traffic resolving here is not physically here — which
 * cuts both ways: it catches operators routing through these countries, and it
 * catches residents who are exactly who they appear to be. The second group is
 * the cost, and the cap rather than a ban is what keeps that cost survivable.
 *
 * Kept as an env-overridable list because the right answer moves with where
 * the traffic is, and a code deploy is the wrong latency for that.
 */
export const FREEBUFF_RESTRICTED_COUNTRIES: readonly string[] = ['SG', 'CN']

/**
 * The one sentence every capacity refusal shares.
 *
 * ## Why it is one string and not per-cohort copy
 *
 * A restricted account (restricted country, flagged domain, observed foreign
 * toolset) hits its ceiling far sooner than anyone else, and if the message it
 * saw were different it would be telling the operator which signal caught
 * them — the exact leak `docs/freebuff-honeypot-models.md` separates detection
 * from enforcement to avoid. Identical copy for everyone means a $1 account
 * and a $15 account read the same wall, and neither learns anything about how
 * it was measured.
 *
 * ## Why it names abuse
 *
 * Because it is true, and because a limit without a reason reads as a product
 * that broke or a user who did something wrong. Naming the cause puts it
 * somewhere other than the reader: "sustained automated abuse" is plainly
 * about someone else, while still explaining why the rules changed under
 * someone who did nothing differently.
 *
 * ## What it deliberately omits
 *
 * Any number. The caps stay server-side for the reason
 * `docs/freebuff-abuse-detection.md` gives — the abuse pattern here is
 * sustained pacing just under the caps, so a published cap is a published
 * pacing instruction. And the surrounding copy on each surface already
 * supplies the concrete part a user actually needs: when it resets.
 *
 * It deliberately does not open with "Free", either: three of the four places
 * it is used already begin with "Free mode…" or "Free premium-model…", and the
 * repetition reads as a copy bug.
 */
export const FREEBUFF_CAPACITY_NOTICE =
  'Capacity is now limited per account — sustained automated abuse forced us to cap how much any one account can use.'

/**
 * How far past its ceiling an account may get before a LIVE session is cut.
 *
 * The ceiling above gates fresh admission only — a session already open is
 * never interrupted — and for a $15 account that is the right trade: the
 * overshoot is bounded by one ordinary session and interrupting real work to
 * save cents is the worse error. At $0.50 the same rule is not the same rule.
 * Measured over 24h on 2026-08-13, against a $0.50 ceiling:
 *
 *   restricted_country   p50 3.6x   worst 12.6x   ($6.32)
 *   privacy_egress       p50 4.7x   worst 23.2x   ($11.59)
 *   flagged_email_domain p50 1.8x   worst 38.2x   ($19.10)
 *
 * A cap that is exceeded 38-fold is not a cap. This multiplier is the second,
 * hard bound: crossing `ceiling x multiplier` refuses the request even mid
 * session. Two, not one, deliberately — a session admitted at $0.49 must be
 * able to finish the turn it started, or the gate becomes a coin flip on
 * whether a legitimate reply is truncated. Two bounds the worst case at
 * roughly one session's spend past the ceiling, which is what the fresh-
 * admission gate was always assumed to cost.
 *
 * It does NOT apply to the region ceilings. Those are already large enough
 * that overshoot is proportionally small (worst observed 1.3x), and cutting a
 * live session at $15 buys little for a real user's interruption.
 */
export const FREEBUFF_SPEND_CEILING_HARD_MULTIPLIER = 2

/**
 * Reasons whose ceiling is small enough that the hard multiplier applies.
 *
 * `region` and `trust_level` are excluded: both are whole-population limits
 * where the fresh-admission gate is proportionate, and applying a hard cut
 * there would interrupt ordinary paying-in-attention users mid-thought.
 */
const HARD_CAPPED_REASONS: ReadonlySet<string> = new Set([
  'restricted_country',
  'privacy_egress',
  'flagged_email_domain',
  'third_party_client',
  'unverified_egress',
])

export type FreebuffSpendCeilingReason =
  | 'region'
  | 'restricted_country'
  | 'privacy_egress'
  | 'flagged_email_domain'
  | 'third_party_client'
  | 'unverified_egress'
  | 'trust_level'

export interface FreebuffSpendCeiling {
  usd: number
  /** Which rule produced the winning (lowest) ceiling. Logged so a support
   *  question has a one-word answer. */
  reason: FreebuffSpendCeilingReason
  /** Every rule that applied, for the admin view. */
  applied: { reason: FreebuffSpendCeilingReason; usd: number }[]
}

export interface FreebuffSpendCeilingInput {
  accessTier: FreebuffAccessTier
  /** Resolved country of the request, when known. */
  countryCode?: string | null
  /**
   * True when the request arrived over an anonymizing egress — VPN, proxy,
   * Tor, or a residential-proxy exit.
   *
   * Callers should derive this from `isFreebuffHardBlockedPrivacySignal`
   * rather than by listing signals themselves. That list deliberately excludes
   * `relay`: Apple iCloud Private Relay is a default consumer feature shipped
   * to ordinary people, and the whole privacy pipeline treats it as a green
   * flag. Pricing it as anonymizing egress would put a restricted ceiling on
   * every iPhone user who left a checkbox alone.
   *
   * `hosting` is excluded for a softer reason: it is already the coarse signal
   * that ipinfo over-reports on ISP and business networks, which is why
   * `isFreebuffBenignAsType` exists to walk it back.
   */
  privacyEgress?: boolean
  /** True when the account's email domain is disposable or a privacy relay. */
  flaggedEmailDomain?: boolean
  /** True when the account has been observed sending a non-Freebuff tool
   *  schema. See docs/freebuff-abuse-detection.md. */
  thirdPartyClient?: boolean
  /**
   * True when ipinfo flagged the egress and NO second opinion could be
   * obtained — every configured privacy provider was disabled, exhausted, or
   * erroring.
   *
   * This exists so a provider outage cannot buy an operator a larger budget.
   * Before it, an unreachable Spur produced `spur_failed_limited`, which set a
   * limited tier but no ceiling — so the cheapest way to widen a cap was to
   * exhaust our own vendor quota. On 2026-08-13 Spur was dead for two days and
   * 354,715 lookups in 24h returned nothing; the fail-open path was live that
   * whole time.
   *
   * It is the restricted ceiling and not a block for the usual reason: an
   * unresolved verdict is not evidence, and the accounts it catches include
   * ordinary users behind a business network ipinfo called `hosting`.
   */
  unverifiedEgress?: boolean
  /** The trust matrix's ceiling, when that rollout is enforcing. */
  trustLevelCeilingUsd?: number | null
  /** Overrides, all optional so a missing env var changes nothing. */
  overrides?: {
    regionUsd?: Partial<Record<FreebuffAccessTier, number>>
    restrictedUsd?: number
    restrictedCountries?: readonly string[]
  }
}

/**
 * The one place a free-mode daily spend ceiling is decided.
 *
 * Pure, so the policy is testable without a database and so the admin page can
 * show exactly what an account would get without re-deriving it.
 */
export function resolveFreebuffSpendCeiling(
  input: FreebuffSpendCeilingInput,
): FreebuffSpendCeiling {
  const restrictedUsd =
    input.overrides?.restrictedUsd ?? FREEBUFF_RESTRICTED_DAILY_SPEND_USD
  const restrictedCountries =
    input.overrides?.restrictedCountries ?? FREEBUFF_RESTRICTED_COUNTRIES

  const applied: { reason: FreebuffSpendCeilingReason; usd: number }[] = [
    {
      reason: 'region',
      usd:
        input.overrides?.regionUsd?.[input.accessTier] ??
        FREEBUFF_REGION_DAILY_SPEND_USD[input.accessTier],
    },
  ]

  const country = input.countryCode?.toUpperCase() ?? null
  if (country && restrictedCountries.includes(country)) {
    applied.push({ reason: 'restricted_country', usd: restrictedUsd })
  }
  if (input.privacyEgress) {
    applied.push({ reason: 'privacy_egress', usd: restrictedUsd })
  }
  if (input.flaggedEmailDomain) {
    applied.push({ reason: 'flagged_email_domain', usd: restrictedUsd })
  }
  if (input.unverifiedEgress) {
    applied.push({ reason: 'unverified_egress', usd: restrictedUsd })
  }
  if (input.thirdPartyClient) {
    applied.push({ reason: 'third_party_client', usd: restrictedUsd })
  }
  if (
    typeof input.trustLevelCeilingUsd === 'number' &&
    Number.isFinite(input.trustLevelCeilingUsd)
  ) {
    applied.push({ reason: 'trust_level', usd: input.trustLevelCeilingUsd })
  }

  // Lowest wins, and ties resolve to the EARLIER entry — which is `region`,
  // the least accusatory reason. When a restricted cohort and the region
  // ceiling happen to agree, "region" is both true and the one that does not
  // imply we think something about the account.
  let winner = applied[0]!
  for (const candidate of applied.slice(1)) {
    if (candidate.usd < winner.usd) winner = candidate
  }

  return { usd: winner.usd, reason: winner.reason, applied }
}

/**
 * The spend at which even a LIVE session is refused, or `null` when the
 * winning ceiling is one the hard cap deliberately does not apply to.
 *
 * `null` means "fresh-admission gating only" — the behaviour every ceiling had
 * before this existed. Callers must treat `null` as no hard cap rather than as
 * zero; getting that backwards would cut every region-limited session the
 * moment it opened.
 */
export function resolveFreebuffHardSpendCeiling(
  ceiling: Pick<FreebuffSpendCeiling, 'usd' | 'reason'>,
  multiplier: number = FREEBUFF_SPEND_CEILING_HARD_MULTIPLIER,
): number | null {
  if (!HARD_CAPPED_REASONS.has(ceiling.reason)) return null
  if (!Number.isFinite(multiplier) || multiplier <= 0) return null
  return ceiling.usd * multiplier
}
