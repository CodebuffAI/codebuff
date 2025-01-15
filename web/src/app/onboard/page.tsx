'use server'

import { toast } from '@/components/ui/use-toast'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import { redirect } from 'next/navigation'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'
import { MAX_DATE } from 'common/src/constants'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { genAuthCode } from 'common/util/credentials'
import { env } from '@/env.mjs'
import CardWithBeams from '@/components/card-with-beams'
import { redeemReferralCode } from '../api/referrals/helpers'
import { AuthenticatedQuotaManager } from 'common/billing/quota-manager'
import ClientAnalytics from './ClientAnalytics'

interface PageProps {
  searchParams: {
    auth_code?: string
    referral_code?: string
  }
}

const Onboard = async ({ searchParams }: PageProps) => {
  const authCode = searchParams.auth_code
  const referralCode = searchParams.referral_code
  const session = await getServerSession(authOptions)
  const user = session?.user
  
  // Initialize state variables
  let isFirstTime = true
  let hasNewCredits = false
  let redeemReferralMessage = <></>

  // Initialize analytics component
  const analyticsComponent = (
    <ClientAnalytics
      isFirstTime={isFirstTime}
      hasNewCredits={hasNewCredits}
      referralCode={referralCode}
    />
  )

  // Check if values are present
  if (!authCode || !user) {
    toast({
      title: 'Uh-oh, spaghettio!',
      description:
        'No valid session or auth code. Please try again and reach out to support@codebuff.com if the problem persists.',
    })
    return redirect(env.NEXT_PUBLIC_APP_URL)
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
      description: hasNewCredits
        ? 'Feel free to close this window and head back to your terminal. Enjoy your new credits!'
        : 'Feel free to close this window and head back to your terminal.',
      content: (
        <div className="flex flex-col space-y-2">
          <p>No replay attack for you 👊</p>
          {redeemReferralMessage}
          {analyticsComponent}
        </div>
      ),
    })
  }

  // Check user's usage to determine if they're a first-time user
  const quotaManager = new AuthenticatedQuotaManager()
  const { creditsUsed } = await quotaManager.checkQuota(user.id)
  isFirstTime = creditsUsed === 0
  hasNewCredits = isFirstTime

  // Process referral code if present
  if (referralCode) {
    try {
      const redeemReferralResp = await redeemReferralCode(referralCode, user.id)
      const respJson = await redeemReferralResp.json()
      if (!redeemReferralResp.ok) {
        throw new Error(respJson.error)
      }
      redeemReferralMessage = (
        <p>
          You just earned an extra {respJson.credits_redeemed} credits from your
          referral code!
        </p>
      )
      hasNewCredits = true
    } catch (e) {
      console.error(e)
      const error = e as Error
      redeemReferralMessage = (
        <div className="flex flex-col space-y-2">
          <p>
            Uh-oh, we couldn&apos;t apply your referral code. {error.message}
          </p>
          <p>
            Please try again and reach out to {env.NEXT_PUBLIC_SUPPORT_EMAIL} if
            the problem persists.
          </p>
        </div>
      )
    }
  }

  // Add it to the db
  const didInsert = await db.transaction(async (tx) => {
    await tx
      .insert(schema.fingerprint)
      .values({
        sig_hash: fingerprintHash,
        id: fingerprintId,
      })
      .onConflictDoUpdate({
        target: schema.fingerprint.id,
        set: {
          sig_hash: fingerprintHash,
        },
      })
      .returning({ id: schema.fingerprint.id })
      .then((fingerprints) => {
        if (fingerprints.length === 1) {
          return fingerprints[0].id
        }
        throw new Error('Failed to create fingerprint record')
      })

    const session = await tx
      .insert(schema.session)
      .values({
        sessionToken: crypto.randomUUID(),
        userId: user.id,
        expires: MAX_DATE,
        fingerprint_id: fingerprintId,
      })
      .returning({ userId: schema.session.userId })

    return !!session.length
  })

  // All database operations completed successfully

  // Render the result
  if (didInsert) {
    if (isFirstTime) {
      return CardWithBeams({
        title: 'Welcome to Codebuff!',
        description: hasNewCredits
          ? 'Your credits are now live. Have fun!'
          : 'Your account is now set up and ready to go.',
        content: (
          <div className="flex flex-col space-y-2">
            <Image
              src="/auth-success.png"
              alt="Successful authentication"
              width={600}
              height={600}
            />
            {redeemReferralMessage}
            {analyticsComponent}
          </div>
        ),
      })
    } else {
      return CardWithBeams({
        title: 'Glad to see you again!',
        description: hasNewCredits
          ? 'Your account is active and you have new credits to use.'
          : 'Your account is already active; no extra steps needed.',
        content: (
          <div className="flex flex-col space-y-2">
            <Image
              src="/auth-success.png"
              alt="Successful authentication"
              width={600}
              height={600}
            />
            {redeemReferralMessage}
            {analyticsComponent}
          </div>
        ),
      })
    }
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
