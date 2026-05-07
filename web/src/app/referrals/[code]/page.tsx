import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import Link from 'next/link'

import type { Metadata } from 'next'

import CardWithBeams from '@/components/card-with-beams'
import { PersistReferrer } from '@/components/referral/persist-referrer'
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

  const referrer = await db.query.user.findFirst({
    where: eq(schema.user.referral_code, code),
    columns: { name: true },
  })

  if (!referrer) {
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

  const displayName = referrer.name || referrerParam || 'Someone'

  return (
    <>
      <PersistReferrer referrer={displayName} />
      <CardWithBeams
        title={`${displayName} invited you to Codebuff!`}
        description="Install Codebuff and start building with AI in your terminal."
        content={<InstallInstructions />}
      />
    </>
  )
}
