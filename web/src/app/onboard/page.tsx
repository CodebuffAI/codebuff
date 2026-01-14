'use server'

import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import { env } from '@codebuff/internal/env'

import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import CardWithBeams from '@/components/card-with-beams'
import { logger } from '@/util/logger'
import { OnboardClientWrapper } from '@/components/onboard/onboard-client-wrapper'

import {
  checkFingerprintConflict,
  checkReplayAttack,
  createCliSession,
  getSessionTokenFromCookies,
} from './_db'
import { isAuthCodeExpired, parseAuthCode, validateAuthCode } from './_helpers'

interface PageProps {
  searchParams?: Promise<{
    auth_code?: string
    referral_code?: string
  }>
}

function renderErrorCard(title: string, description: string, message: string) {
  return CardWithBeams({
    title,
    description,
    content: <p>{message}</p>,
  })
}

function renderSuccessPage(
  title: string,
  description: string,
  message: string,
  referralCode?: string,
) {
  const successCard = CardWithBeams({
    title,
    description,
    content: (
      <div className="flex flex-col space-y-4 text-center">
        <p className="text-lg">{message}</p>
        {referralCode && (
          <p className="text-muted-foreground">
            Don't forget to enter your referral code in the CLI to claim your
            bonus credits!
          </p>
        )}
      </div>
    ),
  })

  return (
    <OnboardClientWrapper
      hasReferralCode={!!referralCode}
      referralCode={referralCode}
    >
      {successCard}
    </OnboardClientWrapper>
  )
}

const Onboard = async ({ searchParams }: PageProps) => {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const authCode = resolvedSearchParams.auth_code
  const referralCode = resolvedSearchParams.referral_code
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user) {
    return redirect(env.NEXT_PUBLIC_CODEBUFF_APP_URL)
  }

  if (!authCode) {
    return renderSuccessPage(
      'Welcome to Codebuff!',
      referralCode
        ? "Once you've installed Codebuff, you can close this window."
        : '',
      "You're all set! Head back to your terminal to continue.",
      referralCode,
    )
  }

  const { fingerprintId, expiresAt, receivedHash } = parseAuthCode(authCode)
  const { valid, expectedHash: fingerprintHash } = validateAuthCode(
    receivedHash,
    fingerprintId,
    expiresAt,
    env.NEXTAUTH_SECRET,
  )

  if (!valid) {
    return renderErrorCard(
      'Uh-oh, spaghettio!',
      'Invalid auth code.',
      'Please try again and reach out to support@codebuff.com if the problem persists.',
    )
  }

  if (isAuthCodeExpired(expiresAt)) {
    return renderErrorCard(
      'Uh-oh, spaghettio!',
      'Auth code expired.',
      'Please generate a new code and reach out to support@codebuff.com if the problem persists.',
    )
  }

  const isReplay = await checkReplayAttack(fingerprintHash, user.id)
  if (isReplay) {
    return CardWithBeams({
      title: 'Your account is already connected to your CLI!',
      description:
        'Feel free to close this window and head back to your terminal.',
      content: <p>No replay attack for you 👊</p>,
    })
  }

  const { hasConflict, existingUserId } = await checkFingerprintConflict(
    fingerprintId,
    user.id,
  )
  if (hasConflict) {
    logger.warn(
      { fingerprintId, existingUserId, attemptedUserId: user.id },
      'Fingerprint ownership conflict',
    )
    return renderErrorCard(
      'Unable to complete login',
      'Something went wrong during the login process.',
      `Please try generating a new login code. If the problem persists, contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for assistance.`,
    )
  }

  const sessionToken = await getSessionTokenFromCookies()
  const success = await createCliSession(
    user.id,
    fingerprintId,
    fingerprintHash,
    sessionToken,
  )

  if (success) {
    return renderSuccessPage(
      'Login successful!',
      referralCode
        ? 'Follow the steps above to install Codebuff, then you can close this window.'
        : '',
      'Return to your terminal to continue.',
      referralCode,
    )
  }

  return renderErrorCard(
    'Uh-oh, spaghettio!',
    'Something went wrong.',
    `Not sure what happened. Please try again and reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem persists.`,
  )
}

export default Onboard
