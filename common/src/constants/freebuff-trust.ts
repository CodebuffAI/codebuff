/**
 * Freebuff account standing ("Access Level") — the per-account policy layer
 * that decides how much free capacity an account gets.
 *
 * ## Why this exists
 *
 * Every free-mode control before this was keyed on the ACCOUNT and applied the
 * same number to every account: the same 5,000 requests/day, the same $50
 * spend budget, the same 6 premium sessions. That is only a bound if accounts
 * are scarce, and `docs/freebuff-signup-gate.md` is the record of them not
 * being. A relay pooling 100 minted accounts is entitled, entirely within the
 * rules, to 100x every per-user limit.
 *
 * The signup gate raised the price of minting an account. This raises the
 * price of a FRESH one being worth anything: a brand-new account from an
 * unverifiable network gets a small fraction of the capacity, and an account
 * that has demonstrably existed and done work for months gets considerably
 * MORE than the flat limits ever gave it. Same fleet spend, redistributed
 * toward the people we actually want to serve.
 *
 * ## Two axes, deliberately separate
 *
 * `FreebuffAccessTier` (full / limited) is a REGION property, resolved per
 * request from the caller's IP country. `FreebuffTrustLevel` is an ACCOUNT
 * property, resolved from durable facts about the account. They multiply:
 * limits are a matrix, not a sum. A limited-region user can climb to `core`
 * and get more than a full-region `new` account — which is the whole point of
 * shipping this alongside the region split rather than instead of it.
 *
 * ## What the level must never be
 *
 * A ban input, or a reason to serve a degraded model. Everything here produces
 * a NUMBER — a limit — and a limit that is reached produces a retryable 429
 * naming the remedy. `docs/freebuff-abuse-detection.md` records what it cost
 * the last time a soft signal was allowed to convict (659 wrongly-banned
 * accounts, 2026-08-03); none of the signals below is stronger than the ones
 * that did it.
 *
 * ## Naming
 *
 * User-facing copy says "Access Level" and never "trust", because a user shown
 * a low trust score reads an accusation. The code says `trustLevel` because
 * that is what it is and a euphemism in an identifier costs a reader time.
 * `FREEBUFF_TRUST_LEVEL_LABELS` is the one bridge between the two.
 */

import type { FreebuffAccessTier } from './freebuff-models'

// ---------------------------------------------------------------------------
// Levels
// ---------------------------------------------------------------------------

/**
 * Ordered least- to most-established. The order is load-bearing:
 * `FREEBUFF_TRUST_LEVELS.indexOf` is how "at least X" comparisons are done, so
 * inserting a level in the middle re-ranks every comparison in one edit rather
 * than requiring each call site to be found.
 */
export const FREEBUFF_TRUST_LEVELS = [
  'new',
  'verified',
  'established',
  'core',
] as const

export type FreebuffTrustLevel = (typeof FREEBUFF_TRUST_LEVELS)[number]

/** The level an account holds before anything is known about it. Every failure
 *  path in the resolver must land somewhere DEFINITE, and this is not it — see
 *  `FREEBUFF_TRUST_FALLBACK_LEVEL`. */
export const FREEBUFF_TRUST_MIN_LEVEL: FreebuffTrustLevel = 'new'

/**
 * The level used when signals cannot be loaded (database error, timeout).
 *
 * `established` and NOT `new`, and this is the single most consequential
 * constant in the file. This resolver runs on the free-mode hot path; if a
 * Postgres hiccup dropped every caller to `new`, one degraded dependency would
 * throttle the entire product to a fifth of its capacity, and it would look
 * exactly like an outage nobody could attribute. Failing to the level that
 * reproduces roughly today's flat limits means a broken resolver costs us the
 * enforcement, never the users. Same reasoning as the signup gate's fail-open.
 */
export const FREEBUFF_TRUST_FALLBACK_LEVEL: FreebuffTrustLevel = 'established'

export function isAtLeastTrustLevel(
  level: FreebuffTrustLevel,
  minimum: FreebuffTrustLevel,
): boolean {
  return (
    FREEBUFF_TRUST_LEVELS.indexOf(level) >=
    FREEBUFF_TRUST_LEVELS.indexOf(minimum)
  )
}

function lowerOf(
  a: FreebuffTrustLevel,
  b: FreebuffTrustLevel,
): FreebuffTrustLevel {
  return isAtLeastTrustLevel(a, b) ? b : a
}

/** User-facing name. Never says "trust", "risk" or "score" — a user reading
 *  their own level is reading an explanation of their limits, not a verdict on
 *  their character. */
export const FREEBUFF_TRUST_LEVEL_LABELS: Record<FreebuffTrustLevel, string> = {
  new: 'Getting started',
  verified: 'Verified',
  established: 'Established',
  core: 'Core member',
}

/** One line of user-facing copy per level, shown under the label. */
export const FREEBUFF_TRUST_LEVEL_BLURBS: Record<FreebuffTrustLevel, string> = {
  new: 'Welcome! Your account is brand new, so limits start small. They open up quickly — the steps below take a few minutes.',
  verified:
    'Your account is verified. You have solid daily limits, and a bit of history unlocks the next level.',
  established:
    'You are an established Freebuff user with generous limits on messages, spend and premium sessions.',
  core: 'You are a core member. You get the highest free limits we offer, in every region.',
}

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Everything a level controls, in one place.
 *
 * Every field is a per-account ceiling over a time window. None is a global
 * budget and none is a concurrency cap — read each doc comment rather than
 * inferring from the name.
 */
export interface FreebuffTrustLimits {
  /**
   * User prompts per Pacific day. NOT requests: one prompt is one root agent
   * run, and an agentic turn behind it may make dozens of LLM calls.
   *
   * This is the limit that means what a person thinks "messages" means, and it
   * is the one an honest heavy user should be able to feel without hitting.
   * Counted only when a call OPENS a root run (`isNewPromptWindow`), so a
   * caller that reuses one run id to hide many prompts pays the run-reuse
   * guard's ceiling instead.
   */
  userMessagesPerDay: number
  /** Total free-mode LLM requests in any 5-hour window: prompts plus every
   *  subagent, tool loop and retry underneath them. */
  messagesPer5Hours: number
  /** Total free-mode LLM requests per day. The overall ceiling — a premium
   *  request consumes this budget as well as its own. */
  messagesPerDay: number
  /**
   * Settled non-BYOK provider cost, in USD, since midnight Pacific, at or
   * above which no FRESH session is admitted. Live sessions and reclaims are
   * never interrupted, so the honest reading is "how much we will spend
   * starting new work for this account today".
   */
  dailySpendUsd: number
  /**
   * Premium-model sessions per Pacific day (the shared premium pool's base
   * entitlement). Referral, streak and operator entitlement is ADDED on top of
   * this, so a level never takes away something a user earned.
   *
   * Zero at every limited-region level: the limited tier cannot reach a
   * premium model at all, and the number would be decoration.
   */
  premiumSessionsPerDay: number
}

/**
 * Why the `premiumSessionsPerDay` column was compressed.
 *
 * It used to run 2 / 4 / 5 / 10. It now runs 2 / 3 / 4 / 5, and the change is
 * at the TOP rather than the bottom: `established` tracks
 * `FREEBUFF_PREMIUM_SESSION_LIMIT` as it always has, and `core` came down from
 * 10 to 5.
 *
 * `core` was doing two jobs. It was the abuse control's verdict — this account
 * is demonstrably real — and it was also the only reward in the product big
 * enough to notice, reachable only through facts a user cannot act on today
 * (an aged GitHub account, months of history). "Why do I only get four" had no
 * answer anybody could act on this afternoon.
 *
 * The reward half moved to `freebuff-levels.ts`, which is denominated in
 * something a user can go and do right now, and which tops out at
 * `FREEBUFF_LEVEL_SESSION_CEILING` (7) — above every value in this column. So
 * a core member is no worse off than before once they engage at all, and the
 * route to the ceiling is open to a brand-new account in an unsupported
 * region, which is exactly who it was closed to before.
 *
 * This column only selects anything under `FREEBUFF_TRUST_LEVELS=enforce`;
 * under the default `observe` the flat base applies, so these numbers and the
 * `FREEBUFF_LEVEL_SESSIONS` revert do not interact.
 *
 * The other four axes are unchanged and stay here, because they are cost
 * controls rather than rewards. A Level must never be able to buy its way into
 * a bigger daily SPEND budget, or the incentive and the abuse control end up
 * pointing at the same dial.
 *//**
 * Two axes were deliberately REMOVED from this interface, and the reasoning is
 * worth keeping so they are not quietly re-added.
 *
 * **Concurrent Desktop tabs** (`FREEBUFF_DESKTOP_SESSION_LIMITS.unlimited`) are
 * still enforced but not level-scaled. That is a session-SHAPE control rather
 * than a cost control: starting a session costs nothing, and a session that
 * sits idle costs nothing either. What costs money is the traffic inside it,
 * and that is already bounded four different ways by the fields above.
 *
 * Scaling it by level would therefore have taken visible, immediate capability
 * away from exactly the users we most need to keep — a new user discovers "you
 * may only open one tab" instantly, and it reads as a product that is broken
 * rather than as a budget — in exchange for no measurable saving at all. The
 * premium-session pool stays level-scaled because a premium session is the one
 * whose mere existence commits us to expensive inference.
 *
 * **Browser sessions per day** used to be the other example here, capped at 6
 * on Web and Cloud and unlimited everywhere else. That pool was removed on
 * 2026-08-18 by this same argument taken one step further: if session count is
 * the wrong thing to meter, it is the wrong thing to meter on one surface
 * too.
 */

/**
 * The matrix. Region tier picks the row, account level picks the column.
 *
 * ## How these numbers were chosen
 *
 * `established` × `full` is the current flat-limit fallback (5,000/day,
 * 3,000/5h, $50, 5 premium), and `established` × `limited` reproduces the
 * limited row (3,000/day, 2,000/5h). Keeping the matrix aligned with the flat
 * fallback is deliberate: observe/off mode, resolver failures and enforced
 * `established` accounts must all receive the same baseline. `core` remains
 * the raise, while the levels below `established` tighten newer accounts.
 *
 * Sizing for the two new levels below `established` is anchored on the
 * per-user-per-day distributions in `free-mode-rate-limiter.ts` (full tier p50
 * 131, p90 837, p99 2,351): `verified` at 3,000/day sits above the full tier's
 * p99, and `new` at 1,200/day sits above its p90. So a genuinely new user
 * doing genuinely heavy work still fits, and the accounts that do not fit are
 * the ones doing several times what any measured human does on their first
 * day.
 *
 * `core` is roughly 1.6x `established` rather than unbounded. It is a reward,
 * not an exemption — an account that reaches `core` and is then compromised or
 * sold should still cost a bounded amount, and the fleet-wide spend has to
 * survive every core member using their allowance on the same day.
 *
 * ## The limited row is not merely the full row scaled down
 *
 * Its floor is deliberately harsher (`new` × limited is a third of `new` ×
 * full) because that intersection — brand-new account, unsupported region,
 * often VPN — is the exact shape of the reselling farms. Its ceiling is
 * deliberately generous (`core` × limited beats `verified` × full on every
 * axis it can — premium is region-gated, not level-gated) because the entire
 * promise this makes to a real developer in an unsupported country is that the
 * region is a starting point and not a cage.
 */
export const FREEBUFF_TRUST_LIMITS: Record<
  FreebuffAccessTier,
  Record<FreebuffTrustLevel, FreebuffTrustLimits>
> = {
  full: {
    new: {
      userMessagesPerDay: 120,
      messagesPer5Hours: 800,
      messagesPerDay: 1_200,
      dailySpendUsd: 8,
      premiumSessionsPerDay: 2,
    },
    verified: {
      userMessagesPerDay: 300,
      messagesPer5Hours: 1_800,
      messagesPerDay: 3_000,
      dailySpendUsd: 20,
      premiumSessionsPerDay: 3,
    },
    established: {
      userMessagesPerDay: 600,
      messagesPer5Hours: 3_000,
      messagesPerDay: 5_000,
      dailySpendUsd: 50,
      premiumSessionsPerDay: 4,
    },
    core: {
      userMessagesPerDay: 1_000,
      messagesPer5Hours: 5_000,
      messagesPerDay: 8_000,
      dailySpendUsd: 90,
      premiumSessionsPerDay: 5,
    },
  },
  limited: {
    new: {
      userMessagesPerDay: 40,
      messagesPer5Hours: 400,
      messagesPerDay: 500,
      dailySpendUsd: 3,
      premiumSessionsPerDay: 0,
    },
    verified: {
      userMessagesPerDay: 120,
      messagesPer5Hours: 1_000,
      messagesPerDay: 1_500,
      dailySpendUsd: 10,
      premiumSessionsPerDay: 0,
    },
    established: {
      userMessagesPerDay: 350,
      messagesPer5Hours: 2_000,
      messagesPerDay: 3_000,
      dailySpendUsd: 25,
      premiumSessionsPerDay: 0,
    },
    core: {
      userMessagesPerDay: 700,
      messagesPer5Hours: 3_500,
      messagesPerDay: 5_500,
      dailySpendUsd: 55,
      premiumSessionsPerDay: 0,
    },
  },
}

export function freebuffTrustLimits(
  accessTier: FreebuffAccessTier,
  level: FreebuffTrustLevel,
): FreebuffTrustLimits {
  return FREEBUFF_TRUST_LIMITS[accessTier][level]
}

// ---------------------------------------------------------------------------
// Signals
// ---------------------------------------------------------------------------

/**
 * Everything the score is computed from.
 *
 * **`null` means "unknown", never "clean" and never "suspicious".** Every
 * account created before `docs/freebuff-signup-gate.md` shipped has null
 * provenance, and every account that never linked GitHub has null GitHub
 * facts. A scorer that read null as bad would demote most of the existing user
 * base overnight; one that read it as good would hand every fresh signup a
 * clean slate. Unknown earns nothing and costs nothing — which lands those
 * accounts at whatever their other, positive signals justify.
 */
export interface FreebuffTrustSignals {
  /** `user.created_at`. */
  accountCreatedAt: Date | null
  /** `referral_qualification.github_account_created_at` — set by GitHub
   *  server-side and not backdatable, which is what makes it worth points at
   *  all. A commit author date, by contrast, forges in one command. */
  githubAccountCreatedAt: Date | null
  /** Oldest public repo's creation date. Same non-forgeability. */
  githubOldestRepoCreatedAt: Date | null
  githubPublicRepos: number | null
  githubFollowers: number | null
  githubTwoFactorEnabled: boolean | null
  /** Distinct Pacific days the account has used free mode
   *  (`freebuff_daily_usage`). Cheap history that cannot be bought. */
  activeDays: number
  /** Approved bounty submissions. Reviewed proof-of-work — the single
   *  strongest earned signal here, and the one a limited-region user can act
   *  on today without owning an aged GitHub account. */
  approvedBounties: number
  /** Qualified referrals GIVEN (`referral_v2`, active + qualified). */
  qualifiedReferrals: number
  /** Has ever paid us anything. Wired now and worth points now; payments are
   *  planned, and the day they land this needs no scorer change. */
  hasPaid: boolean
  /** Privacy signals recorded at SIGNUP (`user.signup_privacy_signals`), split
   *  on comma. Empty array = checked and clean; null = never checked. */
  signupPrivacySignals: readonly string[] | null
  /** `user.signup_ip_source`. Anything other than `edge_secret`/`cloudflare`
   *  means the caller had some influence over the address. */
  signupIpSource: string | null
  /** Accounts sharing this account's signup /24 or /48. Includes this account,
   *  so 1 is the clean value. */
  signupPrefixAccountCount: number | null
  /** Accounts sharing this account's normalized mailbox. Includes this
   *  account. */
  mailboxAccountCount: number | null
  /** A ban event that was NOT reversed. Live bans never reach here (banned
   *  accounts are refused before any of this runs), so this is history: an
   *  account that was actioned and then unbanned on appeal. */
  hasUnreversedBanEvent: boolean
  /** `user.privacy_flagged_at` — first request ever seen on an ipinfo-flagged
   *  anonymizing egress, uncorroborated. Sticky by construction: written once,
   *  never cleared by code. The WEAK member of the sticky trio, so it carries
   *  the mildest cap below. */
  privacyFlaggedAt: Date | null
  /** `user.privacy_corroborated_at` — first request where a second provider
   *  agreed the egress was anonymizing. Sticky. */
  privacyCorroboratedAt: Date | null
  /** `user.third_party_client_at` — first free-mode request carrying a tool
   *  schema no Freebuff client ships. Sticky, and behavioural rather than
   *  network-derived, which is what makes it worth a hard cap. */
  thirdPartyClientAt: Date | null
  /**
   * The privacy verdict on the CURRENT request, from `getFreeModeRiskScore`.
   * The one live signal in an otherwise durable set, and the one a user can
   * change in a second by toggling a VPN — which is why it can only CAP a
   * level, never contribute points.
   */
  currentRiskScore: number | null
}

/** A signal that moved the score, in user-facing language. */
export interface FreebuffTrustFactor {
  id: string
  label: string
  points: number
}

/** Something the user can do to move up, with what it is worth. */
export interface FreebuffTrustNextStep {
  id: string
  label: string
  detail: string
  points: number
  /** Where the UI should send them. Relative to the freebuff web app. */
  href?: string
}

export interface FreebuffTrustAssessment {
  level: FreebuffTrustLevel
  /** 0-100. Exposed so a user can see movement between levels, and so the
   *  thresholds below are auditable from the outside. */
  score: number
  /** The level the score alone earned, before caps. Equal to `level` unless a
   *  cap applied — which is how the UI knows to explain the cap rather than
   *  telling someone with 80 points to keep earning points. */
  uncappedLevel: FreebuffTrustLevel
  /** Which cap bound, if any. */
  cappedBy: string | null
  factors: FreebuffTrustFactor[]
  nextSteps: FreebuffTrustNextStep[]
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * The two signals a user can act on TODAY, from any country, with no aged
 * GitHub account and no money.
 *
 * ## Why the caps are where they are
 *
 * They were originally 4 bounties (20) and 5 referrals (15). Together that is
 * 35 points against a `core` threshold of 75, and the whole earned-only route
 * — bounties, referrals, 90 days of account age, 30 active days, a clean
 * residential signup — topped out at **70**. Five points short. `core` was
 * literally unreachable by contribution: it required either an aged GitHub
 * account or a payment.
 *
 * That is backwards for a program whose stated purpose is to give developers
 * in unsupported regions a way to raise their own limits. It also made the
 * incentive flat exactly where it should be steep — a user who completed ten
 * bounties and referred twenty people scored the same as one who did four and
 * five.
 *
 * At 6 and 10 the earned-only route reaches 95, so `core` is attainable by
 * work alone, and each additional bounty or referral keeps paying well past
 * the point where someone has proved they are real.
 *
 * ## Why raising them costs nothing against abuse
 *
 * Neither is cheap to manufacture. A bounty is reviewed proof-of-work, daily
 * capped, and carries an anti-fraud agreement the claimant signs
 * (docs/freebuff-bounties.md). A qualified referral requires the REFERRED
 * account to hold a GitHub account four calendar months old and to actually
 * use the product, and referral farming has its own detector and clawback path
 * (docs/freebuff-abuse-referral-farming.md). An operator who can produce ten
 * qualified referrals has already cleared a higher bar than this scorer sets.
 */
export const FREEBUFF_TRUST_EARNED = {
  BOUNTY_POINTS: 5,
  BOUNTY_CAP: 6,
  REFERRAL_POINTS: 3,
  REFERRAL_CAP: 10,
} as const

const MAX_BOUNTY_POINTS =
  FREEBUFF_TRUST_EARNED.BOUNTY_POINTS * FREEBUFF_TRUST_EARNED.BOUNTY_CAP
const MAX_REFERRAL_POINTS =
  FREEBUFF_TRUST_EARNED.REFERRAL_POINTS * FREEBUFF_TRUST_EARNED.REFERRAL_CAP

/** Minimum score for each level. `new` is the floor and needs no entry. */
export const FREEBUFF_TRUST_THRESHOLDS: Record<
  Exclude<FreebuffTrustLevel, 'new'>,
  number
> = {
  verified: 25,
  established: 50,
  core: 75,
}

const DAY_MS = 24 * 60 * 60 * 1000
const MONTH_MS = 30 * DAY_MS
const YEAR_MS = 365 * DAY_MS

function ageMs(date: Date | null, now: Date): number | null {
  if (!date) return null
  const age = now.getTime() - date.getTime()
  // A future date is a clock skew or a bad backfill, not an old account.
  return age >= 0 ? age : 0
}

/** Highest threshold `score` clears. */
function levelForScore(score: number): FreebuffTrustLevel {
  if (score >= FREEBUFF_TRUST_THRESHOLDS.core) return 'core'
  if (score >= FREEBUFF_TRUST_THRESHOLDS.established) return 'established'
  if (score >= FREEBUFF_TRUST_THRESHOLDS.verified) return 'verified'
  return 'new'
}

const PRIVACY_EGRESS_SIGNALS = new Set(['vpn', 'proxy', 'tor', 'hosting'])

function hasPrivacyEgressAtSignup(
  signals: readonly string[] | null,
): boolean | null {
  if (signals === null) return null
  return signals.some((signal) =>
    PRIVACY_EGRESS_SIGNALS.has(signal.trim().toLowerCase()),
  )
}

/**
 * Score an account and resolve its level.
 *
 * Pure, so the policy is unit-testable and so the same function can run on the
 * server (to enforce) and be reasoned about from a test (to check nobody moved
 * a threshold by accident). Every I/O concern lives in the caller.
 *
 * ## Points earn, penalties cap
 *
 * Positive signals add points. Negative signals mostly do NOT subtract — they
 * impose a CEILING on the resulting level. The difference matters: a
 * subtracting penalty is defeated by accumulating enough of anything else,
 * which is precisely what a farm operator with 200 aged GitHub accounts can
 * do. A ceiling is not, and it also degrades honestly — a VPN user who cannot
 * exceed `established` still gets `established`, which is today's limits.
 */
export function assessFreebuffTrust(
  signals: FreebuffTrustSignals,
  now: Date = new Date(),
): FreebuffTrustAssessment {
  const factors: FreebuffTrustFactor[] = []
  const nextSteps: FreebuffTrustNextStep[] = []

  const add = (id: string, label: string, points: number) => {
    if (points === 0) return
    factors.push({ id, label, points })
  }
  const step = (s: FreebuffTrustNextStep) => nextSteps.push(s)

  // --- GitHub -------------------------------------------------------------
  // The heaviest block (up to 45) because it is the only one an abuser has to
  // BUY. `docs/referrals.md` sets the economic invariant this inherits: keep
  // the reward worth less than the grey-market price of an aged, qualifying
  // GitHub account, and farming stops penciling out.
  const githubAge = ageMs(signals.githubAccountCreatedAt, now)
  if (githubAge === null) {
    step({
      id: 'connect_github',
      label: 'Connect your GitHub account',
      detail:
        'Linking a GitHub account you have had for a while is the fastest way to raise your limits. We read the account and oldest-repo creation dates, which GitHub sets and nobody can backdate.',
      points: 30,
      href: '/web/settings',
    })
  } else {
    add('github_linked', 'GitHub account connected', 10)
    if (githubAge >= 3 * YEAR_MS) {
      add('github_age', 'GitHub account over 3 years old', 20)
    } else if (githubAge >= YEAR_MS) {
      add('github_age', 'GitHub account over a year old', 15)
    } else if (githubAge >= 6 * MONTH_MS) {
      add('github_age', 'GitHub account over 6 months old', 10)
    } else {
      step({
        id: 'github_age',
        label: 'Your GitHub account is still new',
        detail:
          'Account age is worth up to 20 points and grows on its own — nothing to do here but keep the same account connected.',
        points: 10,
      })
    }

    const repoAge = ageMs(signals.githubOldestRepoCreatedAt, now)
    if (repoAge !== null && repoAge >= 6 * MONTH_MS) {
      add('github_repo', 'Public repo over 6 months old', 10)
    }
    if ((signals.githubPublicRepos ?? 0) >= 3) {
      add('github_repos', '3 or more public repos', 5)
    }
    if ((signals.githubFollowers ?? 0) >= 5) {
      add('github_followers', '5 or more GitHub followers', 5)
    }
    if (signals.githubTwoFactorEnabled) {
      add('github_2fa', 'Two-factor auth enabled on GitHub', 5)
    } else if (signals.githubTwoFactorEnabled === false) {
      step({
        id: 'github_2fa',
        label: 'Turn on two-factor auth for GitHub',
        detail:
          'Worth 5 points, and it protects the account your Freebuff limits now depend on.',
        points: 5,
        href: 'https://github.com/settings/security',
      })
    }
  }

  // --- Account history ----------------------------------------------------
  // Time and use, which cost an operator real calendar days per account and
  // are the only signals a user gets for free by simply being real.
  const accountAge = ageMs(signals.accountCreatedAt, now)
  if (accountAge !== null) {
    if (accountAge >= 90 * DAY_MS) {
      add('account_age', 'Freebuff account over 90 days old', 15)
    } else if (accountAge >= 30 * DAY_MS) {
      add('account_age', 'Freebuff account over 30 days old', 10)
    } else if (accountAge >= 7 * DAY_MS) {
      add('account_age', 'Freebuff account over 7 days old', 5)
    }
  }

  if (signals.activeDays >= 30) {
    add('active_days', 'Used Freebuff on 30+ days', 10)
  } else if (signals.activeDays >= 7) {
    add('active_days', 'Used Freebuff on 7+ days', 5)
  }

  // --- Earned -------------------------------------------------------------
  // The routes that work from anywhere, on any account age. This is the answer
  // to "I am in an unsupported region and my account is new": both of these
  // are available today and together are worth 35 points, which is a level and
  // a half.
  const bountyPoints =
    Math.min(signals.approvedBounties, FREEBUFF_TRUST_EARNED.BOUNTY_CAP) *
    FREEBUFF_TRUST_EARNED.BOUNTY_POINTS
  if (bountyPoints > 0) {
    add(
      'bounties',
      `${signals.approvedBounties} approved ${signals.approvedBounties === 1 ? 'bounty' : 'bounties'}`,
      bountyPoints,
    )
  }
  if (bountyPoints < MAX_BOUNTY_POINTS) {
    step({
      id: 'bounties',
      label: 'Complete a bounty',
      detail: `Approved bounties are worth ${FREEBUFF_TRUST_EARNED.BOUNTY_POINTS} points each, up to ${MAX_BOUNTY_POINTS}. They are reviewed, they work from any country, and they pay session grants on top.`,
      points: MAX_BOUNTY_POINTS - bountyPoints,
      href: '/web/earn',
    })
  }

  const referralPoints =
    Math.min(signals.qualifiedReferrals, FREEBUFF_TRUST_EARNED.REFERRAL_CAP) *
    FREEBUFF_TRUST_EARNED.REFERRAL_POINTS
  if (referralPoints > 0) {
    add(
      'referrals',
      `${signals.qualifiedReferrals} qualified ${signals.qualifiedReferrals === 1 ? 'referral' : 'referrals'}`,
      referralPoints,
    )
  }
  if (referralPoints < MAX_REFERRAL_POINTS) {
    step({
      id: 'referrals',
      label: 'Invite other developers',
      detail: `Each friend who signs up with a real GitHub account and uses Freebuff is worth ${FREEBUFF_TRUST_EARNED.REFERRAL_POINTS} points, up to ${MAX_REFERRAL_POINTS} — plus the referral rewards themselves.`,
      points: MAX_REFERRAL_POINTS - referralPoints,
      href: '/web/earn',
    })
  }

  if (signals.hasPaid) {
    add('paid', 'Supported Freebuff with a purchase', 25)
  }

  // --- Provenance ---------------------------------------------------------
  // Small positives only. These cannot earn a level on their own; their job is
  // to let a clean, ordinary signup reach `verified` without owning anything.
  const signupPrivacy = hasPrivacyEgressAtSignup(signals.signupPrivacySignals)
  if (signupPrivacy === false) {
    add('clean_signup', 'Signed up from a residential connection', 5)
  }
  if (
    signals.signupIpSource === 'edge_secret' ||
    signals.signupIpSource === 'cloudflare'
  ) {
    add('verified_signup_ip', 'Verified network at signup', 5)
  }

  const score = Math.max(
    0,
    Math.min(
      100,
      factors.reduce((sum, factor) => sum + factor.points, 0),
    ),
  )
  const uncappedLevel = levelForScore(score)

  // --- Caps ---------------------------------------------------------------
  // Applied after scoring, lowest wins. Each one names itself so the UI can
  // explain a cap instead of telling a user with a high score to earn more.
  let level = uncappedLevel
  let cappedBy: string | null = null
  const cap = (limit: FreebuffTrustLevel, reason: string) => {
    const capped = lowerOf(level, limit)
    if (capped !== level) {
      level = capped
      cappedBy = reason
    }
  }

  // A reversed ban is invisible here by construction — only unreversed events
  // reach this field — so this is an account we actioned and did not take
  // back. Not a ban (they are already unbanned) and not permanent, but not
  // something to hand extra capacity to either.
  if (signals.hasUnreversedBanEvent) {
    cap('verified', 'past_enforcement')
  }

  // Signed up behind a VPN/proxy/Tor/hosting egress. Capped, not zeroed: this
  // describes a lot of privacy-conscious developers as well as every farm, and
  // `established` is what everyone had before this file existed.
  if (signupPrivacy === true) {
    cap('established', 'signup_privacy_egress')
  }

  // The live request is on an anonymizing network. Deliberately the only cap
  // driven by a per-request signal, and deliberately the harshest, because it
  // is the one an abuser toggles: without it, a farm signs up cleanly once and
  // then runs everything through a proxy pool at core-member limits.
  if (signals.currentRiskScore !== null && signals.currentRiskScore >= 75) {
    cap('verified', 'anonymous_network')
  }

  // The sticky flags: things this account has DONE, remembered past the
  // request that revealed them. Without these, every network cap above is
  // defeated by toggling the VPN off for a day — the exact wash-trading of
  // signals the caps exist to prevent. They cap rather than subtract for the
  // standard reason (see "Points earn, penalties cap"), and they grade by
  // evidence weight:
  //
  //   corroborated egress   -> verified     two providers agreed
  //   foreign tool schema   -> verified     behavioural, not network luck
  //   ipinfo-only egress    -> established  one provider, the weak signal --
  //                                         `established` is what every
  //                                         account had before trust levels
  //                                         existed, so this cap forfeits
  //                                         only the `core` upside
  //
  // The 2026-08-03 mass-reversal is the reason none of these goes lower:
  // network-derived evidence has wrongly actioned real users before, and a
  // permanent flag with a harsh cap would make that mistake permanent too.
  if (signals.privacyCorroboratedAt !== null) {
    cap('verified', 'past_corroborated_egress')
  }
  if (signals.thirdPartyClientAt !== null) {
    cap('verified', 'third_party_client')
  }
  if (signals.privacyFlaggedAt !== null) {
    cap('established', 'past_privacy_egress')
  }

  // Signup networks and mailboxes that many accounts share. `?? 1` matters:
  // null is unknown (pre-provenance accounts), and unknown must not cap.
  if ((signals.signupPrefixAccountCount ?? 1) >= 8) {
    cap('established', 'shared_signup_network')
  }
  if ((signals.mailboxAccountCount ?? 1) >= 3) {
    cap('verified', 'shared_mailbox')
  }

  // Steps are ordered by what they are worth, EXCEPT that a binding cap goes
  // first regardless. A capped account told to "complete a bounty for 20
  // points" when points are not what binds them is being sent on an errand, so
  // the cap is prepended after the sort rather than competing in it — it
  // carries no points and would otherwise sink to the bottom.
  const earnedSteps = nextSteps.sort((a, b) => b.points - a.points)
  const actionableSteps =
    cappedBy === null
      ? earnedSteps
      : [
          {
            id: `cap_${cappedBy}`,
            label: CAP_REMEDIES[cappedBy]?.label ?? 'Your level is limited',
            detail:
              CAP_REMEDIES[cappedBy]?.detail ??
              'Something about this account limits how high your level can go.',
            points: 0,
          },
          ...earnedSteps,
        ]

  return {
    level,
    score,
    uncappedLevel,
    cappedBy,
    factors: factors.sort((a, b) => b.points - a.points),
    nextSteps: actionableSteps,
  }
}

/**
 * User-facing explanation of each cap.
 *
 * Two of these describe something the user can fix in under a minute (turn the
 * VPN off, use a different network) and are written to say exactly that. The
 * other two describe history, and say so honestly rather than implying an
 * action that does not exist — a "next step" a user cannot take is worse than
 * no step at all.
 */
const CAP_REMEDIES: Record<string, { label: string; detail: string }> = {
  past_corroborated_egress: {
    label: 'This account has used an anonymizing network',
    detail:
      'Requests from this account were confirmed to come through a VPN, proxy or similar exit. That history caps this account at Verified. Everything else still counts toward your level.',
  },
  past_privacy_egress: {
    label: 'This account has connected over a flagged network',
    detail:
      'A connection from this account looked like an anonymizing network. That caps this account at Established. If this seems wrong — some office and university networks are misread — contact support.',
  },
  third_party_client: {
    label: 'A non-Freebuff client has used this account',
    detail:
      'Requests from this account carried a client we do not ship. That caps this account at Verified. Only official Freebuff apps are supported on free mode.',
  },
  anonymous_network: {
    label: 'Turn off your VPN or proxy',
    detail:
      'We cannot tell where requests from a VPN, proxy or Tor exit node come from, so those connections are capped at Verified no matter how much you have earned. Reconnect from your normal network and your level updates within a few minutes.',
  },
  signup_privacy_egress: {
    label: 'You signed up over a VPN or proxy',
    detail:
      'That caps this account at Established. Everything else still counts, and the cap applies to this account only — it is not a strike against you.',
  },
  shared_signup_network: {
    label: 'Many accounts signed up from your network',
    detail:
      'Shared offices, campuses and carrier NATs all look like this, so it caps rather than blocks. Approved bounties and referrals still raise your limits within the cap.',
  },
  shared_mailbox: {
    label: 'Several accounts share your email address',
    detail:
      'Address variations that reach one inbox (dots, or anything after a +) count as one mailbox. Using a single account raises your level.',
  },
  past_enforcement: {
    label: 'This account was actioned in the past',
    detail:
      'Your access is fully restored, but the level is capped at Verified. Contact support if you think that is wrong.',
  },
}

// ---------------------------------------------------------------------------
// Wire shape
// ---------------------------------------------------------------------------

/**
 * What a client is told about its own standing.
 *
 * Carries the resolved LIMITS as well as the level, because a client that had
 * to map level → limits itself would hold a second copy of the matrix above
 * and drift from it on the first tuning pass. The server owns the numbers; the
 * client renders whatever it is sent.
 */
/**
 * What a level means, in words.
 *
 * ## Why the numbers do not leave the server
 *
 * Three reasons, and the first is the one that matters most:
 *
 * 1. **A published limit is a published target.** `docs/freebuff-abuse-
 *    detection.md` records that the abuse pattern here is not bursting, it is
 *    "sustained pacing just under the daily caps" — so telling an operator
 *    exactly where the cap sits is telling them exactly how to sit under it.
 *    Every threshold in this file is a number we would rather they had to
 *    discover.
 * 2. **The numbers are ours, not theirs.** `dailySpendUsd` in particular is
 *    our provider cost, and a user shown "$25/day" learns something about our
 *    margins and nothing about what they may do.
 * 3. **Exact figures invite exactly the wrong conversation.** The first
 *    version showed them and produced people comparing screenshots and asking
 *    whether a smaller number meant they had been punished. A limit is meant
 *    to answer "can I get my work done", and that question has a qualitative
 *    answer.
 *
 * So `FreebuffStandingInfo` carries these phrases and NOT `FreebuffTrustLimits`
 * — the raw matrix never crosses the wire, which means no client can render it
 * by accident and no future surface has to remember not to.
 *
 * Where a user genuinely needs a count, they already have an exact one: the
 * model picker renders "N of M sessions used" from the live quota snapshot,
 * which is authoritative and per-model. Duplicating it here could only
 * disagree with it.
 */
export interface FreebuffStandingHighlight {
  label: string
  value: string
}

const LIMIT_PHRASES: Record<
  FreebuffTrustLevel,
  { prompts: string; depth: string; premium: string }
> = {
  new: {
    prompts: 'Enough to get a project started',
    depth: 'Focused, shorter agent runs',
    premium: 'Occasional access',
  },
  verified: {
    prompts: 'Comfortable for everyday work',
    depth: 'Full agent runs',
    premium: 'Regular access',
  },
  established: {
    prompts: 'Comfortable on heavy days',
    depth: 'Long runs with plenty of subagents',
    premium: 'Generous access',
  },
  core: {
    prompts: 'The most we offer',
    depth: 'The most we offer',
    premium: 'The most we offer',
  },
}

export function freebuffStandingHighlights(
  accessTier: FreebuffAccessTier,
  level: FreebuffTrustLevel,
): FreebuffStandingHighlight[] {
  const phrases = LIMIT_PHRASES[level]
  return [
    { label: 'Prompts a day', value: phrases.prompts },
    { label: 'Work per prompt', value: phrases.depth },
    {
      label: 'Premium models',
      // Stated as a region fact rather than as something this account lacks:
      // no level in the limited row can reach a premium model, so framing it
      // as a level shortfall would send the user chasing points that cannot
      // buy it.
      value:
        freebuffTrustLimits(accessTier, level).premiumSessionsPerDay > 0
          ? phrases.premium
          : 'Not available in your region yet',
    },
  ]
}

/**
 * NOTE FOR CALLERS: `highlights` is what the level WOULD grant, which is only
 * what the account actually gets once `FREEBUFF_TRUST_LEVELS=enforce`. Both
 * producers gate on that (the Earn route and the session `standing` field), so
 * a client that receives this can render it as fact. A third producer must do
 * the same — see the comment in freebuff/web/src/app/api/web/standing/route.ts
 * for what happens otherwise.
 */
export interface FreebuffStandingInfo {
  level: FreebuffTrustLevel
  label: string
  blurb: string
  score: number
  /** Score at which the next level starts, or null at `core`. */
  nextLevelAt: number | null
  nextLevel: FreebuffTrustLevel | null
  cappedBy: string | null
  cappedReason: string | null
  factors: FreebuffTrustFactor[]
  nextSteps: FreebuffTrustNextStep[]
  accessTier: FreebuffAccessTier
  /** Semantic, never numeric — see FreebuffStandingHighlight. */
  highlights: FreebuffStandingHighlight[]
}

export function toFreebuffStandingInfo(
  assessment: FreebuffTrustAssessment,
  accessTier: FreebuffAccessTier,
): FreebuffStandingInfo {
  const index = FREEBUFF_TRUST_LEVELS.indexOf(assessment.level)
  const nextLevel = FREEBUFF_TRUST_LEVELS[index + 1] ?? null
  return {
    level: assessment.level,
    label: FREEBUFF_TRUST_LEVEL_LABELS[assessment.level],
    blurb: FREEBUFF_TRUST_LEVEL_BLURBS[assessment.level],
    score: assessment.score,
    nextLevel,
    nextLevelAt:
      nextLevel && nextLevel !== 'new'
        ? FREEBUFF_TRUST_THRESHOLDS[nextLevel]
        : null,
    cappedBy: assessment.cappedBy,
    cappedReason: assessment.cappedBy
      ? (CAP_REMEDIES[assessment.cappedBy]?.detail ?? null)
      : null,
    factors: assessment.factors,
    nextSteps: assessment.nextSteps,
    accessTier,
    highlights: freebuffStandingHighlights(accessTier, assessment.level),
  }
}
