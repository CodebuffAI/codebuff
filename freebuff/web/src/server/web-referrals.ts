import {
  evaluateWebReferralForReferredUser,
  getReferralScore,
  redeemReferralCode,
} from '@codebuff/billing'

import { clearReferralCode, getReferralCode } from '@/vly/lib/referral-cookies'
import { logger } from '@/util/logger'

/**
 * Bring the signed-in user's web referral state up to date and return their
 * web referral score. Runs from the convex-token route (the only authed
 * server hop on every Freebuff Web session), so the whole referral lifecycle
 * is server-side against the shared Postgres ledger:
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
}): Promise<number> {
  const { userId } = params

  const cookieCode = await getReferralCode()
  if (cookieCode) {
    const result = await redeemReferralCode({
      userId,
      referralCode: cookieCode,
      program: 'web',
      logger,
    })
    // Every outcome except invalid_code is terminal for this user, so drop
    // the cookie to keep future token mints cheap. An unknown code may be a
    // legacy Convex-format code that the spin flow still wants; leave it for
    // the attribution window to expire.
    if (result.ok || result.error !== 'invalid_code') {
      await clearReferralCode()
    }
  }

  await evaluateWebReferralForReferredUser({ userId, logger }).catch(
    (error) => {
      logger.warn({ error, userId }, 'Failed to evaluate pending web referral')
    },
  )

  return getReferralScore({ userId, program: 'web' })
}
