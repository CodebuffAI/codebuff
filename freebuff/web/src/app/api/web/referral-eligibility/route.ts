import {
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
  isGithubAccountOldEnoughForReferral,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import { getReferralQualification } from '@codebuff/billing'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { syncWebReferralState } from '@/server/web-referrals'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'

/**
 * Live referral eligibility for the signed-in visitor of /get-started, so the
 * onboarding card can tell them whether the invite they're claiming will count.
 *
 * The bright line for the headline reward (GLM 5.2) is a linked GitHub account
 * that is at least MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL months old (the
 * unified bar). `qualifies` only reflects this age check — the referral still
 * requires the friend to ACTIVATE by using a product, which can't have happened
 * yet on /get-started, so the card frames it as "use Freebuff to unlock", not
 * "unlocked".
 */
export type ReferralEligibilityData = {
  /** Whether the visitor is signed in at all. */
  signedIn: boolean
  /** Whether a GitHub account is linked to the signed-in user. */
  githubLinked: boolean
  /** True once we know the GitHub account passes the age bar (still needs use). */
  qualifies: boolean
  /** False when we couldn't read the account age (e.g. GitHub API hiccup). */
  accountAgeKnown: boolean
  /** The age bar, surfaced so the copy stays in sync with the constant. */
  minMonths: number
}

export async function GET() {
  const session = await getServerSession(authOptions)
  const userId = session?.user?.id

  if (!userId) {
    return NextResponse.json({
      signedIn: false,
      githubLinked: false,
      qualifies: false,
      accountAgeKnown: false,
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
    } satisfies ReferralEligibilityData)
  }

  // Redeem the referral attribution cookie now that the invited friend is
  // signed in on /get-started — the earliest authed hop in the CLI referral
  // funnel. This credits the referral (Postgres only; no web app / Convex)
  // the moment they sign in via the CLI invite link, before they even install
  // the CLI. Unlike the /onboard Server Component, this is a Route Handler, so
  // clearing the cookie after redemption works normally. Best-effort: a
  // referral hiccup must never break the eligibility check the page renders.
  await syncWebReferralState({ userId }).catch((error) => {
    logger.warn(
      { userId, error },
      'referral redemption on /get-started eligibility check failed',
    )
  })

  try {
    const qualification = await getReferralQualification({ userId, logger })
    const githubLinked = qualification.reason !== 'no_github_account'
    const accountCreatedAt = qualification.accountCreatedAt
    const qualifies = accountCreatedAt
      ? isGithubAccountOldEnoughForReferral(
          accountCreatedAt.getTime(),
          Date.now(),
          MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
        )
      : false

    return NextResponse.json({
      signedIn: true,
      githubLinked,
      qualifies,
      accountAgeKnown: accountCreatedAt != null,
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
    } satisfies ReferralEligibilityData)
  } catch (error) {
    // Don't fail the page on a GitHub/DB hiccup: report "signed in, age
    // unknown" so the card still shows the install step.
    logger.warn({ userId, error }, 'referral-eligibility check failed')
    return NextResponse.json({
      signedIn: true,
      githubLinked: true,
      qualifies: false,
      accountAgeKnown: false,
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_REFERRAL,
    } satisfies ReferralEligibilityData)
  }
}
