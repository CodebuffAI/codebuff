import { describe, it, expect } from 'bun:test'

import {
  REFERRAL_QUALIFICATION,
  REFERRAL_QUALIFICATION_RECHECK_TTL_MS,
  decideFromCache,
  fetchGitHubQualificationData,
  meetsReferralBrightLine,
} from '../referral-qualification'

import type { CachedQualification } from '../referral-qualification'

const NOW = new Date('2026-06-09T00:00:00.000Z')

function monthsBefore(now: Date, months: number): Date {
  const d = new Date(now.getTime())
  d.setMonth(d.getMonth() - months)
  return d
}

describe('meetsReferralBrightLine', () => {
  it('qualifies an old account with an old public repo', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: new Date('2022-01-01T00:00:00.000Z'),
      oldestPublicRepoCreatedAt: new Date('2023-01-01T00:00:00.000Z'),
      now: NOW,
    })
    expect(result).toEqual({ qualified: true, reason: null })
  })

  it('rejects an account younger than the minimum age', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: monthsBefore(NOW, 6), // 6 months old, need 12
      oldestPublicRepoCreatedAt: monthsBefore(NOW, 6),
      now: NOW,
    })
    expect(result).toEqual({ qualified: false, reason: 'account_too_new' })
  })

  it('rejects when the account has no public repos', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: new Date('2020-01-01T00:00:00.000Z'),
      oldestPublicRepoCreatedAt: null,
      now: NOW,
    })
    expect(result).toEqual({ qualified: false, reason: 'no_qualifying_repo' })
  })

  it('rejects when the oldest public repo is too recent', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: new Date('2020-01-01T00:00:00.000Z'),
      oldestPublicRepoCreatedAt: monthsBefore(NOW, 3), // 3 months old, need 6
      now: NOW,
    })
    expect(result).toEqual({ qualified: false, reason: 'no_qualifying_repo' })
  })

  it('checks account age before repo age (account_too_new takes priority)', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: monthsBefore(NOW, 1),
      oldestPublicRepoCreatedAt: null,
      now: NOW,
    })
    expect(result.reason).toBe('account_too_new')
  })

  it('treats an account exactly at the age cutoff as old enough', () => {
    const result = meetsReferralBrightLine({
      accountCreatedAt: monthsBefore(
        NOW,
        REFERRAL_QUALIFICATION.MIN_ACCOUNT_AGE_MONTHS,
      ),
      oldestPublicRepoCreatedAt: monthsBefore(
        NOW,
        REFERRAL_QUALIFICATION.MIN_OLDEST_REPO_AGE_MONTHS,
      ),
      now: NOW,
    })
    expect(result.qualified).toBe(true)
  })

  it('rejects an account one day under the age cutoff', () => {
    const justUnder = monthsBefore(
      NOW,
      REFERRAL_QUALIFICATION.MIN_ACCOUNT_AGE_MONTHS,
    )
    justUnder.setDate(justUnder.getDate() + 1)
    const result = meetsReferralBrightLine({
      accountCreatedAt: justUnder,
      oldestPublicRepoCreatedAt: new Date('2020-01-01T00:00:00.000Z'),
      now: NOW,
    })
    expect(result).toEqual({ qualified: false, reason: 'account_too_new' })
  })
})

describe('fetchGitHubQualificationData', () => {
  function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  }

  function fakeFetch(handlers: Record<string, () => Response>): typeof fetch {
    // Match the most specific (longest) key first so '/repos' wins over '/user'
    // for the '/users/{login}/repos' URL.
    const keys = Object.keys(handlers).sort((a, b) => b.length - a.length)
    return (async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString()
      const key = keys.find((k) => url.includes(k))
      if (!key) throw new Error(`Unexpected fetch: ${url}`)
      return handlers[key]()
    }) as typeof fetch
  }

  it('parses id, login, dates, and the extra signals', async () => {
    const fetchFn = fakeFetch({
      '/user': () =>
        jsonResponse({
          id: 12345,
          login: 'octocat',
          created_at: '2019-01-01T00:00:00Z',
          followers: 42,
          public_repos: 7,
          two_factor_authentication: true,
        }),
      '/repos': () => jsonResponse([{ created_at: '2020-03-15T00:00:00Z' }]),
    })

    const data = await fetchGitHubQualificationData({
      accessToken: 'tok',
      fetchFn,
    })

    expect(data).toEqual({
      githubUserId: '12345',
      githubLogin: 'octocat',
      accountCreatedAt: new Date('2019-01-01T00:00:00Z'),
      oldestPublicRepoCreatedAt: new Date('2020-03-15T00:00:00Z'),
      followers: 42,
      publicRepos: 7,
      twoFactorEnabled: true,
    })
  })

  it('nulls the extra signals when GitHub omits them', async () => {
    const fetchFn = fakeFetch({
      '/user': () =>
        jsonResponse({
          id: 1,
          login: 'minimal',
          created_at: '2019-01-01T00:00:00Z',
        }),
      '/repos': () => jsonResponse([]),
    })
    const data = await fetchGitHubQualificationData({
      accessToken: 'tok',
      fetchFn,
    })
    expect(data?.followers).toBeNull()
    expect(data?.publicRepos).toBeNull()
    expect(data?.twoFactorEnabled).toBeNull()
  })

  it('returns null when the profile call fails (revoked token)', async () => {
    const fetchFn = fakeFetch({
      '/user': () => jsonResponse({ message: 'Bad credentials' }, 401),
    })
    const data = await fetchGitHubQualificationData({
      accessToken: 'tok',
      fetchFn,
    })
    expect(data).toBeNull()
  })

  it('returns a null repo date when the user has no public repos', async () => {
    const fetchFn = fakeFetch({
      '/user': () =>
        jsonResponse({
          id: 7,
          login: 'newbie',
          created_at: '2024-01-01T00:00:00Z',
        }),
      '/repos': () => jsonResponse([]),
    })
    const data = await fetchGitHubQualificationData({
      accessToken: 'tok',
      fetchFn,
    })
    expect(data?.oldestPublicRepoCreatedAt).toBeNull()
    expect(data?.githubUserId).toBe('7')
  })

  it('does not fail qualification fetch when the repos call errors', async () => {
    const fetchFn = fakeFetch({
      '/user': () =>
        jsonResponse({
          id: 9,
          login: 'ratelimited',
          created_at: '2018-01-01T00:00:00Z',
        }),
      '/repos': () => jsonResponse({ message: 'rate limited' }, 403),
    })
    const data = await fetchGitHubQualificationData({
      accessToken: 'tok',
      fetchFn,
    })
    expect(data?.accountCreatedAt).toEqual(new Date('2018-01-01T00:00:00Z'))
    expect(data?.oldestPublicRepoCreatedAt).toBeNull()
  })
})

describe('decideFromCache', () => {
  // A row whose facts genuinely qualify at NOW (account 2y, repo ~1.5y).
  const qualifyingRow: CachedQualification = {
    qualified: true,
    reason: null,
    githubUserId: '42',
    accountCreatedAt: monthsBefore(NOW, 24),
    oldestPublicRepoCreatedAt: monthsBefore(NOW, 18),
    followers: 10,
    publicRepos: 5,
    twoFactorEnabled: true,
    checkedAt: NOW,
  }

  it('refetches when there is no cached row', () => {
    expect(decideFromCache({ cached: null, now: NOW })).toEqual({
      kind: 'refetch',
    })
  })

  it('returns qualified when the stored facts qualify (column already in sync)', () => {
    const decision = decideFromCache({ cached: qualifyingRow, now: NOW })
    expect(decision.kind).toBe('return')
    if (decision.kind === 'return') {
      expect(decision.qualification.qualified).toBe(true)
      expect(decision.columnStale).toBe(false)
    }
  })

  it('derives from facts, not the stored boolean: stale "qualified=true" flips to false', () => {
    // Simulates a tightened policy / drifted column: the boolean says qualified
    // but the facts (6-month-old account) do not clear the 1-year bar.
    const decision = decideFromCache({
      cached: {
        ...qualifyingRow,
        qualified: true,
        reason: null,
        accountCreatedAt: monthsBefore(NOW, 6),
        oldestPublicRepoCreatedAt: monthsBefore(NOW, 6),
      },
      now: NOW,
    })
    expect(decision.kind).toBe('return')
    if (decision.kind === 'return') {
      expect(decision.qualification.qualified).toBe(false)
      expect(decision.qualification.reason).toBe('account_too_new')
      expect(decision.columnStale).toBe(true)
    }
  })

  it('flips a cached negative to qualified once the account ages in', () => {
    const negative: CachedQualification = {
      ...qualifyingRow,
      qualified: false,
      reason: 'account_too_new',
      accountCreatedAt: monthsBefore(NOW, 6),
      oldestPublicRepoCreatedAt: monthsBefore(NOW, 6),
    }
    // A year later those same dates clear both bars.
    const later = new Date('2027-06-09T00:00:00.000Z')
    const decision = decideFromCache({ cached: negative, now: later })
    expect(decision.kind).toBe('return')
    if (decision.kind === 'return') {
      expect(decision.qualification.qualified).toBe(true)
      expect(decision.columnStale).toBe(true)
    }
  })

  it('never refetches a not-qualified row whose oldest repo is known', () => {
    // Oldest repo is non-null, so the facts are complete and aging is
    // deterministic. Even far past the TTL we answer locally.
    const decision = decideFromCache({
      cached: {
        ...qualifyingRow,
        qualified: false,
        reason: 'no_qualifying_repo',
        accountCreatedAt: monthsBefore(NOW, 24),
        oldestPublicRepoCreatedAt: monthsBefore(NOW, 1), // too recent
      },
      now: new Date(NOW.getTime() + REFERRAL_QUALIFICATION_RECHECK_TTL_MS + 1),
    })
    expect(decision.kind).toBe('return')
    if (decision.kind === 'return') {
      expect(decision.qualification.qualified).toBe(false)
    }
  })

  it('returns a fresh no-repo row but refetches it once stale', () => {
    // Oldest repo null: a newly created repo could change the answer, so we do
    // re-check GitHub, but only past the TTL.
    const noRepoRow: CachedQualification = {
      ...qualifyingRow,
      qualified: false,
      reason: 'no_qualifying_repo',
      accountCreatedAt: monthsBefore(NOW, 24),
      oldestPublicRepoCreatedAt: null,
    }
    expect(decideFromCache({ cached: noRepoRow, now: NOW }).kind).toBe('return')
    const stale = new Date(
      NOW.getTime() + REFERRAL_QUALIFICATION_RECHECK_TTL_MS + 1,
    )
    expect(decideFromCache({ cached: noRepoRow, now: stale })).toEqual({
      kind: 'refetch',
    })
  })

  it('refetches a cached error (no facts) once stale', () => {
    const errorRow: CachedQualification = {
      qualified: false,
      reason: 'github_api_error',
      githubUserId: '42',
      accountCreatedAt: null,
      oldestPublicRepoCreatedAt: null,
      followers: null,
      publicRepos: null,
      twoFactorEnabled: null,
      checkedAt: NOW,
    }
    expect(decideFromCache({ cached: errorRow, now: NOW }).kind).toBe('return')
    const stale = new Date(
      NOW.getTime() + REFERRAL_QUALIFICATION_RECHECK_TTL_MS + 1,
    )
    expect(decideFromCache({ cached: errorRow, now: stale }).kind).toBe(
      'refetch',
    )
  })
})
