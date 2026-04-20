import { env } from '@codebuff/common/env'
import { headers } from 'next/headers'
import Link from 'next/link'

import type { ReferralCodeResponse } from '../../api/referrals/[code]/route'
import type { Metadata } from 'next'

import CardWithBeams from '@/components/card-with-beams'
import { Button } from '@/components/ui/button'
import { InstallInstructions } from '@/components/ui/install-instructions'

export const generateMetadata = async ({
  searchParams,
}: {
  params: Promise<{ code: string }>
  searchParams: Promise<{ referrer?: string }>
}): Promise<Metadata> => {
  const resolvedSearchParams = await searchParams
  const referrerName = resolvedSearchParams.referrer
  const title = referrerName
    ? `${referrerName} invited you to Codebuff!`
    : 'You were invited to Codebuff!'

  return {
    title,
    description: 'Install Codebuff and start building with AI in your terminal.',
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
  const referrerParam = resolvedSearchParams.referrer

  let referrerName: string | null = null
  try {
    const baseUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'http://localhost:3000'
    const headerList = await headers()
    const cookie = headerList.get('Cookie') ?? ''
    const response = await fetch(`${baseUrl}/api/referrals/${code}`, {
      headers: { Cookie: cookie },
    })

    if (!response.ok) {
      throw new Error('Failed to fetch referral data')
    }

    const referralData: ReferralCodeResponse = await response.json()
    referrerName = referralData.referrerName
  } catch {
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

  const displayName = referrerName || referrerParam || 'Someone'

  return (
    <CardWithBeams
      title={`${displayName} invited you to Codebuff!`}
      description="Install Codebuff and start building with AI in your terminal."
      content={<InstallInstructions />}
    />
  )
}
