import {
  evaluateGlmReferralForReferredUser,
  evaluateWebReferralForReferredUser,
  getWebReferralScore,
  recordReferralV2Attribution,
  redeemReferralCode,
} from '@codebuff/billing'

import { clearReferralCode, getReferralCode } from '@/vly/lib/referral-cookies'
import { logger } from '@/util/logger'

/**
 * Collaborators of {@link syncWebReferralState}, injectable so the orchestration
 * (cookie redemption + best-effort clear + evaluation) is unit-testable without
 * a database or a real cookie store (see docs/testing.md: DI over mocking).
 * Defaults are the real implementations, so production callers pass nothing.
 */
export interface SyncWebReferralDeps {
  getReferralCode: typeof getReferralCode
  clearReferralCode: typeof clearReferralCode
  redeemReferralCode: typeof redeemReferralCode
  recordReferralV2Attribution: typeof recordReferralV2Attribution
  evaluateWebReferralForReferredUser: typeof evaluateWebReferralForReferredUser
  evaluateGlmReferralForReferredUser: typeof evaluateGlmReferralForReferredUser
  getWebReferralScore: typeof getWebReferralScore
}

const defaultSyncWebReferralDeps: SyncWebReferralDeps = {
  getReferralCode,
  clearReferralCode,
  redeemReferralCode,
  recordReferralV2Attribution,
  evaluateWebReferralForReferredUser,
  evaluateGlmReferralForReferredUser,
  getWebReferralScore,
}

/**
 * Bring the signed-in user's web referral state up to date and return their
 * web referral score. Runs from two authed server hops, so the whole referral
 * lifecycle is server-side against the shared Postgres ledger:
 *   - the Freebuff Web convex-token route (every <=10 min while the web/cloud
 *     app is open), and
 *   - the CLI `/onboard` page on successful login — the ONLY redemption hop a
 *     CLI-only user ever makes, since they never load the web/cloud apps.
 *
 * 1. If the `vly_referral_code` attribution cookie is set, redeem it
 *    (program 'web') — this is the same `user.referral_code` token + cookie
 *    attribution used by the CLI program.
 * 2. Evaluate the user's own pending web referral (GitHub account age gate +
 *    shared burn-once ledger). Pending referrals age in here, since the
 *    token refreshes every <=10 minutes while the user is active.
 * 3. Return the web referral score for the JWT claim.
 */
export async function syncWebReferralState(params: {
  userId: string
  deps?: SyncWebReferralDeps
}): Promise<number> {
  const { userId, deps = defaultSyncWebReferralDeps } = params

  const cookieCode = await deps.getReferralCode()
  if (cookieCode) {
    // The same freebuff.com referral link drives both the Web tier ('web') and
    // the CLI GLM reward ('glm'), so redeem the cookie under both programs.
    // Each is independently scored and burned-once; the referrer benefits from
    // whichever surface they actually use.
    const [webResult, glmResult] = await Promise.all([
      deps.redeemReferralCode({
        userId,
        referralCode: cookieCode,
        program: 'web',
        logger,
      }),
      deps.redeemReferralCode({
        userId,
        referralCode: cookieCode,
        program: 'glm',
        logger,
      }),
    ])
    // Every outcome except invalid_code is terminal for this user, so drop
    // the cookie to keep future token mints cheap. An unknown code may be a
    // legacy Convex-format code that the spin flow still wants; leave it for
    // the attribution window to expire.
    const stillRedeemable = [webResult, glmResult].some(
      (result) => !result.ok && result.error === 'invalid_code',
    )
    if (!stillRedeemable) {
      // Best-effort: in a Server Component render (the CLI /onboard hop) the
      // cookie store is read-only and delete() throws. Redemption already
      // committed above, so swallow it — the cookie just lives out its
      // attribution window instead of being cleared early.
      await deps.clearReferralCode().catch(() => {})
    }

    // Dual-write the unified referral model (docs/referrals.md): one row per
    // referred user, written the moment we resolve the referrer. Idempotent +
    // first-referrer-wins, so re-running on every redemption hop is harmless.
    const referrerId = webResult.ok
      ? webResult.referrerId
      : glmResult.ok
        ? glmResult.referrerId
        : null
    if (referrerId) {
      await deps
        .recordReferralV2Attribution({ referrerId, referredId: userId, logger })
        .catch((error) => {
          logger.warn(
            { error, userId, referrerId },
            'Failed to dual-write referral_v2 attribution',
          )
        })
    }
  }

  await Promise.all([
    deps
      .evaluateWebReferralForReferredUser({ userId, logger })
      .catch((error) => {
        logger.warn(
          { error, userId },
          'Failed to evaluate pending web referral',
        )
      }),
    deps
      .evaluateGlmReferralForReferredUser({ userId, logger })
      .catch((error) => {
        logger.warn(
          { error, userId },
          'Failed to evaluate pending GLM referral',
        )
      }),
  ])

  return deps.getWebReferralScore({ userId })
}
