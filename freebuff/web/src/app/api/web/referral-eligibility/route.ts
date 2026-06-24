import {
  MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
  isGithubAccountOldEnoughForReferral,
} from '@codebuff/common/constants/freebuff-referral-tiers'
import { getReferralQualification } from '@codebuff/billing'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'

/**
 * Live referral eligibility for the signed-in visitor of /get-started, so the
 * onboarding card can tell them whether the invite they're claiming will count.
 *
 * The bright line for the headline reward (GLM 5.2) is just: a linked GitHub
 * account that is at least a year old. We deliberately ignore the CLI program's
 * extra public-repo requirement here — the page only promises the "connect
 * GitHub + 1-year-old account" rule the user sees.
 */
export type ReferralEligibilityData = {
  /** Whether the visitor is signed in at all. */
  signedIn: boolean
  /** Whether a GitHub account is linked to the signed-in user. */
  githubLinked: boolean
  /** True once we know the GitHub account is at least a year old. */
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
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
    } satisfies ReferralEligibilityData)
  }

  try {
    const qualification = await getReferralQualification({ userId, logger })
    const githubLinked = qualification.reason !== 'no_github_account'
    const accountCreatedAt = qualification.accountCreatedAt
    const qualifies = accountCreatedAt
      ? isGithubAccountOldEnoughForReferral(
          accountCreatedAt.getTime(),
          Date.now(),
          MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
        )
      : false

    return NextResponse.json({
      signedIn: true,
      githubLinked,
      qualifies,
      accountAgeKnown: accountCreatedAt != null,
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
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
      minMonths: MIN_GITHUB_ACCOUNT_AGE_MONTHS_GLM,
    } satisfies ReferralEligibilityData)
  }
}
