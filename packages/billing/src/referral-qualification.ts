import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, isNull } from 'drizzle-orm'

import type { Logger } from '@codebuff/common/types/contracts/logger'

/**
 * Referral qualification "bright line".
 *
 * Only referrals of *qualifying* accounts earn a bonus (for both the referred
 * user and the referrer). Anyone can be referred; only accounts that clear this
 * bar pay out. The bar is a single, legible rule:
 *
 *   1. The GitHub account is at least 1 year old, AND
 *   2. The account owns at least one public repo created more than 6 months ago.
 *
 * Why these two signals: both timestamps are set by GitHub server-side and
 * cannot be backdated by the user. A git *commit* author date can be forged in
 * seconds (`GIT_AUTHOR_DATE=... git commit`), so we deliberately do NOT trust
 * commit dates. Account `created_at` and repo `created_at` cannot be moved
 * backward, so they constitute real proof the account was doing work *before*
 * the referral incentive existed.
 *
 * This is a precision-over-recall bar on purpose: a reward that costs real
 * inference dollars (Opus access) should under-pay rather than over-pay. Legit
 * users with thin/new public profiles simply earn no bonus; that costs us
 * nothing. The economic invariant we defend: keep the per-referral reward worth
 * LESS to an abuser than the grey-market cost of an aged, qualifying GitHub
 * account, and farming does not pencil out.
 */
export const REFERRAL_QUALIFICATION = {
  /** Minimum age of the GitHub account itself. */
  MIN_ACCOUNT_AGE_MONTHS: 12,
  /** Minimum age of the account's oldest public repo. */
  MIN_OLDEST_REPO_AGE_MONTHS: 6,
} as const

/**
 * How long a cached *negative* result is trusted before we re-call GitHub.
 * Positive results are cached forever (account/repo ages only increase, so a
 * qualified account stays qualified). Negatives are re-evaluated locally on
 * every read from the stored dates, and only re-fetched from GitHub once this
 * window elapses (to discover newly created repos).
 */
export const REFERRAL_QUALIFICATION_RECHECK_TTL_MS = 24 * 60 * 60 * 1000

const GITHUB_PROVIDER = 'github'
const GITHUB_API_BASE = 'https://api.github.com'
const GITHUB_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
} as const

export type ReferralDisqualifyReason =
  | 'no_github_account'
  | 'github_api_error'
  | 'account_too_new'
  | 'no_qualifying_repo'

/**
 * Public GitHub signals we capture and store. The two timestamps drive the
 * bright line today; followers / public repo count / 2FA are captured on the
 * same API call so future tiers or threshold experiments need no re-crawl. Any
 * field is null when unknown (not fetched / not exposed by the API).
 */
export interface GitHubFacts {
  /** When the GitHub account was created (server-set, not forgeable). */
  accountCreatedAt: Date | null
  /** Creation date of the user's oldest public repo, or null if they have none. */
  oldestPublicRepoCreatedAt: Date | null
  followers: number | null
  publicRepos: number | null
  twoFactorEnabled: boolean | null
}

export interface GitHubQualificationData extends GitHubFacts {
  /** Immutable numeric GitHub user id. Use as the burn-once anti-sybil key. */
  githubUserId: string
  githubLogin: string
  accountCreatedAt: Date
}

export interface ReferralQualification extends GitHubFacts {
  qualified: boolean
  reason: ReferralDisqualifyReason | null
  /** Immutable GitHub user id, when known. Burn this once a bonus is granted. */
  githubUserId: string | null
}

type FetchFn = typeof fetch

function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime())
  result.setMonth(result.getMonth() - months)
  return result
}

/**
 * Pure bright-line evaluation. Both inputs are non-forgeable GitHub server
 * timestamps. Kept pure (no I/O) so the policy is trivially unit-testable and
 * easy to tune.
 */
export function meetsReferralBrightLine(params: {
  accountCreatedAt: Date
  oldestPublicRepoCreatedAt: Date | null
  now: Date
}): { qualified: boolean; reason: ReferralDisqualifyReason | null } {
  const { accountCreatedAt, oldestPublicRepoCreatedAt, now } = params

  const accountCutoff = subtractMonths(
    now,
    REFERRAL_QUALIFICATION.MIN_ACCOUNT_AGE_MONTHS,
  )
  if (accountCreatedAt > accountCutoff) {
    return { qualified: false, reason: 'account_too_new' }
  }

  const repoCutoff = subtractMonths(
    now,
    REFERRAL_QUALIFICATION.MIN_OLDEST_REPO_AGE_MONTHS,
  )
  if (!oldestPublicRepoCreatedAt || oldestPublicRepoCreatedAt > repoCutoff) {
    return { qualified: false, reason: 'no_qualifying_repo' }
  }

  return { qualified: true, reason: null }
}

/**
 * Fetch the two non-forgeable signals from GitHub using the user's OAuth token.
 * Returns null if the account profile can't be read (revoked/expired token,
 * API outage). A missing/unreadable repo list is NOT fatal: it just yields a
 * null oldest-repo date, which the bright line treats as "no qualifying repo".
 *
 * `fetchFn` is injectable so callers (and tests) can supply their own fetch.
 */
export async function fetchGitHubQualificationData(params: {
  accessToken: string
  fetchFn?: FetchFn
  logger?: Logger
  /** Identifiers for the failure logs, so a spike of GitHub errors is traceable
   *  to specific users/identities (e.g. a wave of revoked tokens) instead of an
   *  anonymous count. */
  userId?: string
  githubUserId?: string
}): Promise<GitHubQualificationData | null> {
  const { accessToken, fetchFn = fetch, logger, userId, githubUserId } = params
  const headers = { Authorization: `Bearer ${accessToken}`, ...GITHUB_HEADERS }

  // 1) Account profile -> id, login, created_at.
  const profileRes = await fetchFn(`${GITHUB_API_BASE}/user`, { headers })
  if (!profileRes.ok) {
    logger?.warn(
      { status: profileRes.status, userId, githubUserId },
      'GitHub /user lookup failed during referral qualification',
    )
    return null
  }
  const profile = (await profileRes.json()) as {
    id?: number
    login?: string
    created_at?: string
    followers?: number
    public_repos?: number
    // GET /user is oneOf(private-user, public-user). two_factor_authentication
    // exists only on the private-user view (authenticated as self). If GitHub
    // returns the public view or the scope is insufficient it's absent, so we
    // tolerate undefined and store null. Qualification never depends on it.
    two_factor_authentication?: boolean
  }
  if (!profile.id || !profile.login || !profile.created_at) {
    logger?.warn(
      { userId, githubUserId },
      'GitHub /user returned an incomplete profile during referral qualification',
    )
    return null
  }

  // 2) Oldest public repo -> created_at. The /users/{login}/repos endpoint
  //    returns public repos only; sort=created&direction=asc&per_page=1 gives
  //    the single oldest one in one call. Repo created_at is server-set and
  //    survives forks/transfers without being backdated.
  let oldestPublicRepoCreatedAt: Date | null = null
  const reposRes = await fetchFn(
    `${GITHUB_API_BASE}/users/${encodeURIComponent(
      profile.login,
    )}/repos?type=owner&sort=created&direction=asc&per_page=1`,
    { headers },
  )
  if (reposRes.ok) {
    const repos = (await reposRes.json()) as Array<{ created_at?: string }>
    const oldest = repos[0]
    if (oldest?.created_at) {
      oldestPublicRepoCreatedAt = new Date(oldest.created_at)
    }
  } else {
    logger?.warn(
      { status: reposRes.status, userId, githubUserId },
      'GitHub repos lookup failed during referral qualification',
    )
  }

  return {
    githubUserId: String(profile.id),
    githubLogin: profile.login,
    accountCreatedAt: new Date(profile.created_at),
    oldestPublicRepoCreatedAt,
    followers: profile.followers ?? null,
    publicRepos: profile.public_repos ?? null,
    twoFactorEnabled: profile.two_factor_authentication ?? null,
  }
}

/** A cached qualification row, normalized for the decision logic. */
export interface CachedQualification extends GitHubFacts {
  /** Denormalized column from the last write; NOT the source of truth. */
  qualified: boolean
  reason: ReferralDisqualifyReason | null
  githubUserId: string
  checkedAt: Date
}

export type CacheDecision =
  | { kind: 'refetch' }
  | {
      kind: 'return'
      qualification: ReferralQualification
      /**
       * True when the freshly-derived qualified/reason differs from the stored
       * denormalized column (e.g. the account aged in, or a policy change
       * flipped it). The caller should sync the column.
       */
      columnStale: boolean
    }

function cachedToQualification(
  cached: CachedQualification,
  qualified: boolean,
  reason: ReferralDisqualifyReason | null,
): ReferralQualification {
  return {
    qualified,
    reason,
    githubUserId: cached.githubUserId,
    accountCreatedAt: cached.accountCreatedAt,
    oldestPublicRepoCreatedAt: cached.oldestPublicRepoCreatedAt,
    followers: cached.followers,
    publicRepos: cached.publicRepos,
    twoFactorEnabled: cached.twoFactorEnabled,
  }
}

/**
 * Pure cache policy. Qualification is DERIVED from the stored facts + current
 * policy on every read (not read off the stored `qualified` column), so a
 * threshold change takes effect immediately and the cached column is just a
 * denormalization we keep in sync. The only reason to re-call GitHub is to
 * learn new facts. Kept I/O-free so the rules are unit-testable.
 *
 * - No row -> refetch.
 * - Row with facts -> derive locally. If qualified, done. If not and the oldest
 *   public repo is known, the facts are complete (ages only move one way), so
 *   no refetch is ever needed. If the oldest repo is null, a newly-created repo
 *   could change the answer, so refetch once past the TTL.
 * - Row without facts (a cached error) -> honor the TTL, else refetch.
 */
export function decideFromCache(params: {
  cached: CachedQualification | null
  now: Date
  recheckTtlMs?: number
}): CacheDecision {
  const {
    cached,
    now,
    recheckTtlMs = REFERRAL_QUALIFICATION_RECHECK_TTL_MS,
  } = params

  if (!cached) return { kind: 'refetch' }

  const fresh = now.getTime() - cached.checkedAt.getTime() <= recheckTtlMs

  // Error row (no facts to derive from): trust the TTL, else refetch.
  if (!cached.accountCreatedAt) {
    if (fresh) {
      return {
        kind: 'return',
        columnStale: false,
        qualification: cachedToQualification(
          cached,
          cached.qualified,
          cached.reason,
        ),
      }
    }
    return { kind: 'refetch' }
  }

  const derived = meetsReferralBrightLine({
    accountCreatedAt: cached.accountCreatedAt,
    oldestPublicRepoCreatedAt: cached.oldestPublicRepoCreatedAt,
    now,
  })
  const columnStale =
    derived.qualified !== cached.qualified || derived.reason !== cached.reason

  if (derived.qualified) {
    return {
      kind: 'return',
      columnStale,
      qualification: cachedToQualification(cached, true, null),
    }
  }

  // Not qualified by current facts. If we've never seen a public repo, a new
  // one could change the answer: refetch once stale. Otherwise the facts are
  // complete and aging is deterministic, so the local derivation is final.
  if (cached.oldestPublicRepoCreatedAt === null && !fresh) {
    return { kind: 'refetch' }
  }
  return {
    kind: 'return',
    columnStale,
    qualification: cachedToQualification(cached, false, derived.reason),
  }
}

async function readQualificationCache(
  githubUserId: string,
): Promise<CachedQualification | null> {
  const [row] = await db
    .select({
      qualified: schema.referralQualification.qualified,
      reason: schema.referralQualification.reason,
      githubUserId: schema.referralQualification.github_user_id,
      accountCreatedAt: schema.referralQualification.github_account_created_at,
      oldestPublicRepoCreatedAt:
        schema.referralQualification.oldest_public_repo_created_at,
      followers: schema.referralQualification.github_followers,
      publicRepos: schema.referralQualification.github_public_repos,
      twoFactorEnabled: schema.referralQualification.github_two_factor_enabled,
      checkedAt: schema.referralQualification.checked_at,
    })
    .from(schema.referralQualification)
    .where(eq(schema.referralQualification.github_user_id, githubUserId))
    .limit(1)

  if (!row) return null
  return { ...row, reason: row.reason as ReferralDisqualifyReason | null }
}

/**
 * Upsert the row after a GitHub fetch. Sets checked_at = now (the fetch time,
 * which drives the TTL). The conflict-update set deliberately omits
 * bonus_consumed_at / bonus_consumed_by_user_id so re-checking never resets the
 * burn-once flag.
 */
async function writeQualificationCache(params: {
  githubUserId: string
  githubLogin: string
  userId: string
  qualified: boolean
  reason: ReferralDisqualifyReason | null
  facts: GitHubFacts
  now: Date
}): Promise<void> {
  const { githubUserId, githubLogin, userId, qualified, reason, facts, now } =
    params

  const columns = {
    user_id: userId,
    qualified,
    reason,
    github_login: githubLogin,
    github_account_created_at: facts.accountCreatedAt,
    oldest_public_repo_created_at: facts.oldestPublicRepoCreatedAt,
    github_followers: facts.followers,
    github_public_repos: facts.publicRepos,
    github_two_factor_enabled: facts.twoFactorEnabled,
    checked_at: now,
  }

  await db
    .insert(schema.referralQualification)
    .values({ github_user_id: githubUserId, ...columns })
    .onConflictDoUpdate({
      target: schema.referralQualification.github_user_id,
      set: columns,
    })
}

/**
 * Sync only the denormalized qualified/reason column after a local re-derivation
 * (no GitHub call). Deliberately leaves checked_at and the facts untouched so
 * the TTL still reflects the last real fetch.
 */
async function syncQualificationColumn(params: {
  githubUserId: string
  qualified: boolean
  reason: ReferralDisqualifyReason | null
}): Promise<void> {
  const { githubUserId, qualified, reason } = params
  await db
    .update(schema.referralQualification)
    .set({ qualified, reason })
    .where(eq(schema.referralQualification.github_user_id, githubUserId))
}

/**
 * Determine whether a freebuff user qualifies to be a *bonus-earning* referral.
 *
 * Reads the user's linked GitHub account (login is GitHub-based, so this exists
 * for essentially every user), consults the cache, and only calls GitHub when
 * the cache can't answer. Returns the immutable `githubUserId` so callers can
 * enforce burn-once via {@link tryConsumeReferralBonus}.
 */
export async function getReferralQualification(params: {
  userId: string
  logger: Logger
  now?: Date
  fetchFn?: FetchFn
  /**
   * Pure-cache mode for the periodic sweep: never call GitHub. Aging-in
   * (too_new → qualified) is deterministic from the cached account_created_at,
   * so the bulk backstop can re-derive everything it needs from cache; a
   * first-time/expired-token fetch is left to the user's own live session
   * (which holds a fresh token). This is what keeps the sweep from doing
   * hundreds of network round-trips and timing out.
   */
  cacheOnly?: boolean
}): Promise<ReferralQualification> {
  const { userId, logger, now = new Date(), fetchFn, cacheOnly = false } = params

  const unqualified = (
    reason: ReferralDisqualifyReason,
    githubUserId: string | null = null,
  ): ReferralQualification => ({
    qualified: false,
    reason,
    githubUserId,
    accountCreatedAt: null,
    oldestPublicRepoCreatedAt: null,
    followers: null,
    publicRepos: null,
    twoFactorEnabled: null,
  })

  const [githubAccount] = await db
    .select({
      providerAccountId: schema.account.providerAccountId,
      accessToken: schema.account.access_token,
    })
    .from(schema.account)
    .where(
      and(
        eq(schema.account.userId, userId),
        eq(schema.account.provider, GITHUB_PROVIDER),
      ),
    )
    .limit(1)

  if (!githubAccount) {
    logger.debug({ userId }, 'Referral qualification: no GitHub account linked')
    return unqualified('no_github_account')
  }
  const githubUserId = githubAccount.providerAccountId

  const cached = await readQualificationCache(githubUserId)
  const decision = decideFromCache({ cached, now })
  if (decision.kind === 'return') {
    if (decision.columnStale) {
      // The derived result diverged from the stored denormalized column (the
      // account aged in, or a policy change flipped it). Sync just the column;
      // no GitHub call, and leave checked_at / facts alone.
      await syncQualificationColumn({
        githubUserId,
        qualified: decision.qualification.qualified,
        reason: decision.qualification.reason,
      })
    }
    return decision.qualification
  }

  // Pure-cache caller (the sweep): never hit GitHub. Re-derive from whatever
  // facts we already have (deterministic aging-in still completes); if we have
  // no cached facts, report unknown without fetching or writing anything.
  if (cacheOnly) {
    if (cached?.accountCreatedAt) {
      const derived = meetsReferralBrightLine({
        accountCreatedAt: cached.accountCreatedAt,
        oldestPublicRepoCreatedAt: cached.oldestPublicRepoCreatedAt,
        now,
      })
      return cachedToQualification(cached, derived.qualified, derived.reason)
    }
    return unqualified('github_api_error', cached?.githubUserId ?? githubUserId)
  }

  // Cache miss or stale: re-check against GitHub.
  if (!githubAccount.accessToken) {
    logger.debug(
      { userId, githubUserId },
      'Referral qualification: no GitHub token to refetch',
    )
    return unqualified('github_api_error', githubUserId)
  }

  const data = await fetchGitHubQualificationData({
    accessToken: githubAccount.accessToken,
    fetchFn,
    logger,
    userId,
    githubUserId,
  })
  if (!data) {
    return unqualified('github_api_error', githubUserId)
  }

  const { qualified, reason } = meetsReferralBrightLine({
    accountCreatedAt: data.accountCreatedAt,
    oldestPublicRepoCreatedAt: data.oldestPublicRepoCreatedAt,
    now,
  })

  // Use the DB's providerAccountId as the canonical cache key so the read key
  // and write key are always identical. It equals data.githubUserId (both are
  // the GitHub numeric user id).
  const facts: GitHubFacts = {
    accountCreatedAt: data.accountCreatedAt,
    oldestPublicRepoCreatedAt: data.oldestPublicRepoCreatedAt,
    followers: data.followers,
    publicRepos: data.publicRepos,
    twoFactorEnabled: data.twoFactorEnabled,
  }
  await writeQualificationCache({
    githubUserId,
    githubLogin: data.githubLogin,
    userId,
    qualified,
    reason,
    facts,
    now,
  })

  logger.debug(
    { userId, githubUserId, qualified, reason },
    'Computed referral qualification (fresh)',
  )

  return { qualified, reason, githubUserId, ...facts }
}

/**
 * Burn-once: atomically consume a qualifying GitHub account's single referral
 * bonus. Returns true only if THIS call did the consuming (the account was
 * qualified and not yet consumed). Concurrent callers race on a single row
 * update, so at most one wins. A `false` result means: not qualified, already
 * consumed, or no qualification row exists yet (call getReferralQualification
 * first).
 *
 * `githubUserId` is the referred user's immutable GitHub id (from
 * getReferralQualification). Burning it here is what stops one good account
 * from being recycled across re-signups to farm bonuses.
 *
 * The burn-once ledger is shared across referral programs: a GitHub identity
 * earns at most one bonus EVER, whether via the CLI or Freebuff Web program.
 * `requireBrightLine` (default true) additionally requires the stored
 * bright-line `qualified` column; programs with their own bar (web) pass
 * false after verifying their policy against the stored facts.
 */
export async function tryConsumeReferralBonus(params: {
  githubUserId: string
  consumedByUserId: string
  requireBrightLine?: boolean
  now?: Date
}): Promise<boolean> {
  const {
    githubUserId,
    consumedByUserId,
    requireBrightLine = true,
    now = new Date(),
  } = params

  const consumed = await db
    .update(schema.referralQualification)
    .set({
      bonus_consumed_at: now,
      bonus_consumed_by_user_id: consumedByUserId,
    })
    .where(
      and(
        eq(schema.referralQualification.github_user_id, githubUserId),
        ...(requireBrightLine
          ? [eq(schema.referralQualification.qualified, true)]
          : []),
        isNull(schema.referralQualification.bonus_consumed_at),
      ),
    )
    .returning({
      githubUserId: schema.referralQualification.github_user_id,
    })

  return consumed.length > 0
}

/**
 * GLM-program burn-once. Identical to `tryConsumeReferralBonus` but against the
 * separate `glm_bonus_consumed_at` ledger, so a GitHub identity earns at most
 * one GLM referral independently of any web/cli bonus it may already hold. The
 * GLM program checks account age against the stored facts itself, so this never
 * requires the bright-line `qualified` column.
 */
export async function tryConsumeGlmReferralBonus(params: {
  githubUserId: string
  consumedByUserId: string
  now?: Date
}): Promise<boolean> {
  const { githubUserId, consumedByUserId, now = new Date() } = params

  const consumed = await db
    .update(schema.referralQualification)
    .set({
      glm_bonus_consumed_at: now,
      glm_bonus_consumed_by_user_id: consumedByUserId,
    })
    .where(
      and(
        eq(schema.referralQualification.github_user_id, githubUserId),
        isNull(schema.referralQualification.glm_bonus_consumed_at),
      ),
    )
    .returning({
      githubUserId: schema.referralQualification.github_user_id,
    })

  return consumed.length > 0
}
