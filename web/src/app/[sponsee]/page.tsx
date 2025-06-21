'use server'

import { redirect } from 'next/navigation'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import CardWithBeams from '@/components/card-with-beams'
import { env } from '@codebuff/internal'
import Link from 'next/link'
import { Metadata } from 'next'

export const generateMetadata = async ({
  params,
}: {
  params: { sponsee: string }
}): Promise<Metadata> => {
  return {
    title: `${params.sponsee}'s Referral | Codebuff`,
  }
}

export default async function SponseePage({
  params,
}: {
  params: { sponsee: string }
}) {
  const sponseeName = params.sponsee.toLowerCase()

  const referralCode = await db
    .select({
      referralCode: schema.user.referral_code,
    })
    .from(schema.user)
    .where(eq(schema.user.handle, sponseeName))
    .limit(1)
    .then((result) => result[0]?.referralCode ?? null)

  if (!referralCode) {
    return (
      <CardWithBeams
        title="Hmm, that link doesn't look right."
        description={`We don't have a referral code for "${params.sponsee}".`}
        content={
          <>
            <p className="text-center">
              Please double-check the link you used or try contacting the person
              who shared it.
            </p>
            <p className="text-center text-sm text-muted-foreground">
              You can also reach out to our support team at{' '}
              <Link
                href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
                className="underline"
              >
                {env.NEXT_PUBLIC_SUPPORT_EMAIL}
              </Link>
              .
            </p>
          </>
        }
      />
    )
  }

  redirect(
    `/referrals/${referralCode}?referrer=${encodeURIComponent(sponseeName)}`
  )
}
