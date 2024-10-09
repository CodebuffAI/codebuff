'use server'

import { toast } from '@/components/ui/use-toast'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import { notFound, redirect } from 'next/navigation'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { CREDITS_REFERRAL_BONUS, MAX_DATE } from 'common/src/constants'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { genAuthCode } from 'common/util/credentials'
import { env } from '@/env.mjs'
import CardWithBeams from '@/components/card-with-beams'

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

  // Check if values are present
  if (!authCode || !user) {
    toast({
      title: 'Uh-oh, spaghettio!',
      description:
        'No valid session or auth code. Please try again and reach out to support@manicode.ai if the problem persists.',
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
          Please try again and reach out to support@manicode.ai if the problem
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
          Please generate a new code and reach out to support@manicode.ai if the
          problem persists.
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

    // If referral code is present, attempt to create a referral
    let didInsertReferralCode: boolean | undefined = undefined
    if (referralCode) {
      const referrer = await tx
        .select()
        .from(schema.user)
        .where(eq(schema.user.referral_code, referralCode))
        .limit(1)
        .then((referrers) => {
          if (referrers.length !== 1) {
            return
          }
          return referrers[0]
        })

      if (!referrer) {
        didInsertReferralCode = false
      } else {
        await tx.insert(schema.referral).values({
          referrer_id: referrer.id,
          referred_id: user.id,
          status: 'completed',
          credits: CREDITS_REFERRAL_BONUS,
          created_at: new Date(),
          completed_at: new Date(),
        })

        await tx
          .update(schema.user)
          .set({
            quota: sql<number>`${schema.user.quota} + ${CREDITS_REFERRAL_BONUS}`,
          })
          .where(eq(schema.user.id, referrer.id))

        await tx
          .update(schema.user)
          .set({
            quota: sql<number>`${schema.user.quota} + ${CREDITS_REFERRAL_BONUS}`,
          })
          .where(eq(schema.user.id, user.id))

        didInsertReferralCode = true
      }
    }

    return {
      didInsertFingerprint: !!session.length,
      didInsertReferralCode,
    }
  })

  // Render the result
  return didInsert.didInsertFingerprint
    ? CardWithBeams({
        title: 'Nicely done!',
        description:
          'Feel free to close this window and head back to your terminal. Enjoy the extra api credits!',
        content: (
          <>
            <Image
              src="/auth-success.jpg"
              alt="Successful authentication"
              width={600}
              height={600}
            />
            {didInsert.didInsertReferralCode ? (
              <p>
                You've earned an extra {CREDITS_REFERRAL_BONUS} credits from
                your referral code!
              </p>
            ) : (
              <p>
                Slight hiccup: we couldn\'t automatically apply your referral
                code. Can you go to ${env.NEXT_PUBLIC_APP_URL}/referrals and
                manually apply it?
              </p>
            )}
          </>
        ),
      })
    : CardWithBeams({
        title: 'Uh-oh, spaghettio!',
        description: 'Something went wrong.',
        content: (
          <>
            {didInsert.didInsertReferralCode ? (
              <p>
                Please try again and reach out to{' '}
                {env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem persists.
              </p>
            ) : (
              <p>
                Slight hiccup: we couldn\'t automatically apply your referral
                code. Can you go to ${env.NEXT_PUBLIC_APP_URL}/referrals and
                manually apply it?
              </p>
            )}
          </>
        ),
      })
}

export default Onboard
