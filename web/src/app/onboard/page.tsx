'use server'

import { MAX_DATE } from '@codebuff/common/old-constants'
import { db } from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { genAuthCode } from '@codebuff/common/util/credentials'
import { env } from '@codebuff/internal'
import { and, eq, gt } from 'drizzle-orm'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { redeemReferralCode } from '../api/referrals/helpers'

import CardWithBeams from '@/components/card-with-beams'
import { OnboardClientWrapper } from '@/components/onboard/onboard-client-wrapper'

interface PageProps {
  searchParams?: {
    auth_code?: string
    referral_code?: string
  }
}

const Onboard = async ({ searchParams = {} }: PageProps) => {
  const authCode = searchParams.auth_code
  const referralCode = searchParams.referral_code
  const session = await getServerSession(authOptions)
  const user = session?.user

  console.log('🟢 Onboard Server: Page loaded with params', {
    authCode: !!authCode,
    referralCode,
    hasUser: !!user,
    userId: user?.id,
  })

  // Handle referral-only flow (no CLI auth required)
  if (!user) {
    console.log('🟢 Onboard Server: No user session, redirecting to app URL')
    return redirect(env.NEXT_PUBLIC_CODEBUFF_APP_URL)
  }

  // Handle all non-CLI flows (web users with or without referral codes)
  if (!authCode) {
    const hasReferralInUrl = !!referralCode
    console.log('🟢 Onboard Server: Non-CLI flow detected', {
      hasReferralInUrl,
      referralCode,
    })
    const successCard = CardWithBeams({
      title: 'Welcome to Codebuff!',
      description: hasReferralInUrl
        ? "Once you've installed Codebuff, you can close this window."
        : 'You can close this window.',
      content: (
        <div className="flex flex-col space-y-2">
          <Image
            src="/auth-success.png"
            alt="Successful authentication"
            width={600}
            height={600}
          />
          {hasReferralInUrl && (
            <p className="text-center text-muted-foreground">
              Don't forget to enter your referral code in the CLI to claim your
              bonus credits!
            </p>
          )}
        </div>
      ),
    })

    return (
      <OnboardClientWrapper
        hasReferralCode={hasReferralInUrl}
        referralCode={referralCode}
      >
        {successCard}
      </OnboardClientWrapper>
    )
  }

  const [fingerprintId, expiresAt, receivedfingerprintHash] =
    authCode.split('.')

  // check if auth code is valid
  const fingerprintHash = genAuthCode(
    fingerprintId,
    expiresAt,
    env.NEXTAUTH_SECRET
  )
  if (receivedfingerprintHash !== fingerprintHash) {
    return CardWithBeams({
      title: 'Uh-oh, spaghettio!',
      description: 'Invalid auth code.',
      content: (
        <p>
          Please try again and reach out to support@codebuff.com if the problem
          persists.
        </p>
      ),
    })
  }

  // Check for token expiration
  if (expiresAt < Date.now().toString()) {
    return CardWithBeams({
      title: 'Uh-oh, spaghettio!',
      description: 'Auth code expired.',
      content: (
        <p>
          Please generate a new code and reach out to support@codebuff.com if
          the problem persists.
        </p>
      ),
    })
  }

  // If fingerprint already exists, don't do anything, as this might be a replay attack
  const fingerprintExists = await db
    .select({
      id: schema.user.id,
    })
    .from(schema.user)
    .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .leftJoin(
      schema.fingerprint,
      eq(schema.session.fingerprint_id, schema.fingerprint.id)
    )
    .where(
      and(
        eq(schema.fingerprint.sig_hash, fingerprintHash),
        eq(schema.user.id, user.id)
      )
    )
    .limit(1)
  if (fingerprintExists.length > 0) {
    return CardWithBeams({
      title: 'Your account is already connected to your cli!',
      description:
        'Feel free to close this window and head back to your terminal. Enjoy the extra api credits!',
      content: <p>No replay attack for you 👊</p>,
    })
  }

  // Check if this fingerprint is already associated with a different user
  const existingSession = await db
    .select({
      userId: schema.session.userId,
      expires: schema.session.expires,
    })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.fingerprint_id, fingerprintId),
        gt(schema.session.expires, new Date())
      )
    )
    .limit(1)

  const activeSession = existingSession[0]
  if (activeSession && activeSession.userId !== user.id) {
    // Only reject if the session belongs to a different user
    console.warn(
      {
        fingerprintId,
        existingUserId: activeSession.userId,
        attemptedUserId: user.id,
        event: 'fingerprint_ownership_conflict',
      },
      'Attempt to associate fingerprint with different user'
    )

    return CardWithBeams({
      title: 'Unable to complete login',
      description: 'Something went wrong during the login process.',
      content: (
        <p>
          Please try generating a new login code. If the problem persists,
          contact {env.NEXT_PUBLIC_SUPPORT_EMAIL} for assistance.
        </p>
      ),
    })
  }

  // Add it to the db
  const didInsert = await db.transaction(async (tx: any) => {
    await tx
      .insert(schema.fingerprint)
      .values({
        sig_hash: fingerprintHash,
        id: fingerprintId,
      })
      .onConflictDoNothing()

    const session = await tx
      .insert(schema.session)
      .values({
        sessionToken: crypto.randomUUID(),
        userId: user.id,
        expires: MAX_DATE,
        fingerprint_id: fingerprintId,
        type: 'cli',
      })
      .returning({ userId: schema.session.userId })

    return !!session.length
  })

  // No longer auto-redeem referral codes - users must enter them in CLI
  let referralMessage = <></>
  if (referralCode) {
    referralMessage = (
      <p className="text-center text-muted-foreground">
        Don't forget to enter your referral code in the CLI to claim your bonus
        credits!
      </p>
    )
  }

  // Render the result for CLI flow
  if (didInsert) {
    const isReferralUser = !!referralCode
    const successCard = CardWithBeams({
      title: 'Nicely done!',
      description: isReferralUser
        ? 'Follow the steps above to install Codebuff, then you can close this window.'
        : 'Feel free to close this window and head back to your terminal.',
      content: (
        <div className="flex flex-col space-y-2">
          <Image
            src="/auth-success.png"
            alt="Successful authentication"
            width={600}
            height={600}
          />
          {referralMessage}
        </div>
      ),
    })

    return (
      <OnboardClientWrapper
        hasReferralCode={isReferralUser}
        referralCode={referralCode}
      >
        {successCard}
      </OnboardClientWrapper>
    )
  }
  return CardWithBeams({
    title: 'Uh-oh, spaghettio!',
    description: 'Something went wrong.',
    content: (
      <p>
        Not sure what happened with creating your user. Please try again and
        reach out to {env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem persists.
      </p>
    ),
  })
}

export default Onboard
