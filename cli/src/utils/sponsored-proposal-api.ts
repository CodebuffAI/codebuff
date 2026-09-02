import { normalizeRepoFullName } from '@codebuff/common/ads/sponsored-proposal-target'

import { FREEBUFF_WEB_URL } from '../login/constants'

import { logger } from './logger'

import type { SponsoredProposalRow } from '@codebuff/common/ads/sponsored-proposal-view'

/**
 * The CLI's transport for sponsored proposals (COD-376, Decision 2).
 *
 * REST, because the CLI has no Convex client and is not getting one for this:
 * `git grep convex -- cli/` is empty, and a websocket subscription to reach one
 * card is a dependency the terminal would carry on every launch.
 *
 * FREEBUFF.COM, not codebuff.com, which is where the display-ad calls go. The
 * Convex functions live on freebuff.com and the two web apps share one Postgres,
 * so the session token the CLI already holds signs in on either.
 *
 * PHASE 1 HAS NO ACCEPT, so there is no accept call here. Accepting spawns a
 * thread in an isolated Cloud workspace and the CLI runs against
 * `process.cwd()`; the upstream mutation refuses a repo-keyed row by name, and
 * a client method whose only outcome is that refusal is worse than none.
 */

export type SponsoredProposal = SponsoredProposalRow & {
  _id: string
  advertiser_id: string
}

const REQUEST_TIMEOUT_MS = 10_000

/**
 * The freebuff.com origin these calls go to.
 *
 * THE SAME CONSTANT THE LOGIN FLOW USES, deliberately. This read
 * `process.env.NEXT_PUBLIC_FREEBUFF_APP_URL` raw, which skipped both things
 * that constant does: the `@codebuff/common/env` schema, so an unset or
 * mistyped variable fell back to production with nothing said; and the
 * `IS_DEV` localhost branch, so a developer's proposal traffic left their
 * laptop for production while every other CLI call stayed on :3002 -- writing
 * real prefs and real dismissals against their real account from a dev build.
 */
function baseUrl(): string {
  return FREEBUFF_WEB_URL.replace(/\/+$/, '')
}

async function call<T>(
  method: string,
  path: string,
  authToken: string,
  payload?: unknown,
): Promise<T | null> {
  try {
    const response = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${authToken}`,
        ...(payload === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch (error) {
    // Logged at debug, never surfaced: this whole channel is optional, and a
    // terminal that reports an ad rail's network trouble to the user is
    // spending their attention on our problem.
    logger.debug({ error, path }, '[sponsored-proposal] request failed')
    return null
  }
}

/**
 * The live proposal for a repository, or null.
 *
 * Null covers "no offer", "not signed in", "channel closed" and "the request
 * failed" alike. The caller's response to every one of them is to show no card,
 * so distinguishing them here would buy a branch nobody takes.
 */
export async function fetchSponsoredProposal(
  repoFullName: string,
  authToken: string,
): Promise<SponsoredProposal | null> {
  const repo = normalizeRepoFullName(repoFullName)
  if (!repo) return null
  const result = await call<{ proposal: SponsoredProposal | null }>(
    'GET',
    `/api/v1/ads/proposal?repo=${encodeURIComponent(repo)}`,
    authToken,
  )
  return result?.proposal ?? null
}

export async function dismissSponsoredProposal(
  proposalId: string,
  authToken: string,
): Promise<boolean> {
  return (
    (await call(
      'POST',
      `/api/v1/ads/proposal/${encodeURIComponent(proposalId)}/dismiss`,
      authToken,
      {},
    )) !== null
  )
}

export async function reportSponsoredProposal(
  proposalId: string,
  authToken: string,
  reason?: string,
): Promise<boolean> {
  return (
    (await call(
      'POST',
      `/api/v1/ads/proposal/${encodeURIComponent(proposalId)}/report`,
      authToken,
      reason ? { reason } : {},
    )) !== null
  )
}

/**
 * A standing channel preference: one advertiser refused, or the whole channel
 * turned off. Exactly one per call — they are different weights of answer, and
 * a request that did both would leave no record of which the user chose.
 */
export async function setSponsoredProposalPrefs(
  update: { neverAdvertiserId: string } | { optedOut: boolean },
  authToken: string,
): Promise<boolean> {
  return (await call('POST', '/api/v1/ads/prefs', authToken, update)) !== null
}
