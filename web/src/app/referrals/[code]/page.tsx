import { env } from '@codebuff/common/env'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'
import { headers } from 'next/headers'
import Link from 'next/link'
import { getServerSession } from 'next-auth'

import { authOptions } from '../../api/auth/[...nextauth]/auth-options'

import type { ReferralCodeResponse } from '../../api/referrals/[code]/route'
import type { Metadata } from 'next'

import CardWithBeams from '@/components/card-with-beams'
import { OnboardClientWrapper } from '@/components/onboard/onboard-client-wrapper'
import { Button } from '@/components/ui/button'

export const generateMetadata = async ({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ referrer?: string }>
}): Promise<Metadata> => {
  const resolvedSearchParams = await searchParams
  const referrerName = resolvedSearchParams.referrer
  const title = referrerName
    ? `${referrerName} invited you to Codebuff!`
    : 'Join Codebuff with a referral bonus!'

  return {
    title,
    description:
      'Get bonus credits when you sign up for Codebuff with this referral link.',
  }
}

export default async function ReferralPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ referrer?: string }>
}) {
  const { code } = await params
  const resolvedSearchParams = await searchParams
  const referrerName = resolvedSearchParams.referrer
  const session = await getServerSession(authOptions)

  // Fetch referral information
  let referralData: ReferralCodeResponse
  try {
    const baseUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
    const headerList = await headers()
    const cookie = headerList.get('Cookie') ?? ''
    const response = await fetch(`${baseUrl}/api/referrals/${code}`, {
      headers: {
        Cookie: cookie,
      },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch referral data')
    }

    referralData = await response.json()
  } catch (error) {
    return (
      <CardWithBeams
        title="Invalid Referral Link"
        description="This referral link is not valid or has expired."
        content={
          <>
            <p className="text-center text-muted-foreground">
              Please double-check the link you used or contact the person who
              shared it.
            </p>
            <div className="flex justify-center mt-4">
              <Button asChild>
                <Link href="/">Go to Homepage</Link>
              </Button>
            </div>
          </>
        }
      />
    )
  }

  // Handle referrer with maxed out referrals
  if (referralData.status.reason) {
    return (
      <CardWithBeams
        title="Referral Limit Reached"
        description={
          referralData.status.details?.msg || referralData.status.reason
        }
        content={
          <>
            <p className="text-center text-muted-foreground">
              This user has reached their referral limit. You can still sign up
              for Codebuff!
            </p>
            <div className="flex justify-center mt-4">
              <Button asChild>
                <Link href="/pricing">View Pricing</Link>
              </Button>
            </div>
          </>
        }
      />
    )
  }

  const referrerDisplayName =
    referralData.referrerName || referrerName || 'Someone'

  // Show onboarding flow for valid referrals
  return (
    <OnboardClientWrapper
      hasReferralCode={true}
      referralCode={code}
      referrerName={referrerDisplayName}
    >
      <CardWithBeams
        title={`${referrerDisplayName} invited you to Codebuff!`}
        description={`Sign up and you'll both earn ${CREDITS_REFERRAL_BONUS} bonus credits.`}
        content={
          <div className="text-center text-muted-foreground">
            Follow the steps below to get started, then redeem your referral
            code in the CLI!
          </div>
        }
      />
    </OnboardClientWrapper>
  )
}
