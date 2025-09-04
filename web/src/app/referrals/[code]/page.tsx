import { env } from '@codebuff/internal'
import Link from 'next/link'
import { headers } from 'next/headers'
import { getServerSession } from 'next-auth'

import type { Metadata } from 'next'
import type { ReferralCodeResponse } from '../../api/referrals/[code]/route'

import { authOptions } from '../../api/auth/[...nextauth]/auth-options'
import CardWithBeams from '@/components/card-with-beams'
import { Button } from '@/components/ui/button'
import { ReferralClientWrapper } from '@/components/referral/referral-client-wrapper'

export const generateMetadata = async ({
  params,
  searchParams,
}: {
  params: { code: string }
  searchParams: { referrer?: string }
}): Promise<Metadata> => {
  const referrerName = searchParams.referrer
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
  params: { code: string }
  searchParams: { referrer?: string }
}) {
  const { code } = params
  const referrerName = searchParams.referrer
  const session = await getServerSession(authOptions)

  // Fetch referral information
  let referralData: ReferralCodeResponse
  try {
    const baseUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/referrals/${code}`, {
      headers: {
        Cookie: headers().get('Cookie') ?? '',
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

  // If it's the same user trying to use their own referral code (only check if logged in)
  if (session && referralData.isSameUser) {
    return (
      <CardWithBeams
        title="That's Your Own Referral Code!"
        description="You can't use your own referral code to get bonus credits."
        content={
          <>
            <p className="text-center text-muted-foreground">
              Share your referral link with friends to earn credits when they
              sign up!
            </p>
            <div className="flex justify-center mt-4">
              <Button asChild>
                <Link href="/profile?tab=referrals">View Your Referrals</Link>
              </Button>
            </div>
          </>
        }
      />
    )
  }

  // If referrer has maxed out referrals
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

  // Valid referral - show success page and automatically redeem
  const referrerDisplayName =
    referralData.referrerName || referrerName || 'Someone'

  return (
    <ReferralClientWrapper referralCode={code}>
      <CardWithBeams
        title={`${referrerDisplayName} invited you to Codebuff!`}
        description="You're eligible for bonus credits when you complete the referral."
        content={
          <>
            <div className="text-center space-y-4">
              <p className="text-muted-foreground">
                Welcome! Complete your referral to get bonus credits.
              </p>

              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                {session ? (
                  <Button asChild size="lg">
                    <Link href={`/onboard?referral_code=${code}`}>
                      Complete Referral
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="lg">
                    <Link
                      href={`/login?referral=${code}${referrerName ? `&referrer=${encodeURIComponent(referrerName)}` : ''}`}
                    >
                      Sign Up & Get Bonus Credits
                    </Link>
                  </Button>
                )}
                <Button variant="outline" asChild size="lg">
                  <Link href="/">Learn More</Link>
                </Button>
              </div>
            </div>
          </>
        }
      />
    </ReferralClientWrapper>
  )
}
