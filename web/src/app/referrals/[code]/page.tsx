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
import { GitHubSignInButton } from '@/components/referral/github-signin-button'

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

              <div className="flex justify-center">
                {!session && (
                  <GitHubSignInButton
                    referralCode={code}
                    referrerName={referrerName}
                  />
                )}
              </div>

              {/* Complete Referral button positioned at bottom right for logged-in users */}
              {session && !referralData.isSameUser && (
                <div className="flex justify-end mt-6">
                  <Button asChild>
                    <Link href={`/onboard?referral_code=${code}`}>
                      Complete Referral
                    </Link>
                  </Button>
                </div>
              )}

              {/* Show warning if user is viewing their own referral link */}
              {session && referralData.isSameUser && (
                <div className="mt-6 p-3 bg-red-800 border border-red-900 rounded-md">
                  <p className="text-white text-sm font-medium">
                    ⚠️ This is your own referral link. You will not be able to
                    redeem your own code.
                  </p>
                </div>
              )}
            </div>
          </>
        }
      />
    </ReferralClientWrapper>
  )
}
