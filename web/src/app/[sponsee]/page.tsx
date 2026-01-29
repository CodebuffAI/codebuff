'use server'

import { env } from '@codebuff/common/env'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import type { Metadata } from 'next'

import CardWithBeams from '@/components/card-with-beams'

export const generateMetadata = async ({
  params,
}: {
  params: Promise<{ sponsee: string }>
}): Promise<Metadata> => {
  const { sponsee } = await params
  return {
    title: `${sponsee}'s Referral | Codebuff`,
  }
}

export default async function SponseePage({
  params,
  searchParams,
}: {
  params: Promise<{ sponsee: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { sponsee } = await params
  const resolvedSearchParams = await searchParams
  const sponseeName = sponsee.toLowerCase()

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
        description={`We don't have a referral code for "${sponsee}".`}
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

  // Build query string preserving all incoming params and adding/overriding referrer
  const queryParams = new URLSearchParams()
  for (const [key, value] of Object.entries(resolvedSearchParams)) {
    if (value !== undefined) {
      if (Array.isArray(value)) {
        for (const v of value) {
          queryParams.append(key, v)
        }
      } else {
        queryParams.set(key, value)
      }
    }
  }
  queryParams.set('referrer', sponseeName)

  redirect(`/referrals/${referralCode}?${queryParams.toString()}`)
}
