'use server'

import { env } from '@codebuff/internal/env'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import {
  checkFingerprintConflict,
  checkReplayAttack,
  createCliSession,
  getSessionTokenFromCookies,
} from './_db'
import { isAuthCodeExpired, parseAuthCode, validateAuthCode } from './_helpers'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'

import { ReferrerTracker } from '@/components/referrer-tracker'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { logger } from '@/util/logger'

interface PageProps {
  searchParams?: Promise<{
    auth_code?: string
    referral_code?: string
  }>
}

function StatusCard({
  title,
  description,
  message,
}: {
  title: string
  description: string
  message: string
}) {
  return (
    <main className="container mx-auto flex flex-col items-center py-20">
      <ReferrerTracker />
      <div className="w-full sm:w-1/2 md:w-2/3">
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </CardHeader>
          <CardContent>
            <p>{message}</p>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

const Onboard = async ({ searchParams }: PageProps) => {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const authCode = resolvedSearchParams.auth_code
  const referralCode = resolvedSearchParams.referral_code
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user) {
    return redirect('/login')
  }

  if (!authCode) {
    return (
      <StatusCard
        title="Welcome to Freebuff!"
        description={referralCode ? "Once you've installed Freebuff, you can close this window." : ''}
        message="You're all set! Head back to your terminal to continue."
      />
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
    return (
      <StatusCard
        title="Invalid auth code"
        description="Something went wrong."
        message="Please try again and reach out to support@codebuff.com if the problem persists."
      />
    )
  }

  if (isAuthCodeExpired(expiresAt)) {
    return (
      <StatusCard
        title="Auth code expired"
        description="Your code has expired."
        message="Please generate a new code and reach out to support@codebuff.com if the problem persists."
      />
    )
  }

  const isReplay = await checkReplayAttack(fingerprintHash, user.id)
  if (isReplay) {
    return (
      <StatusCard
        title="Already connected!"
        description="Your account is already connected to your CLI."
        message="Feel free to close this window and head back to your terminal."
      />
    )
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
    return (
      <StatusCard
        title="Unable to complete login"
        description="Something went wrong during the login process."
        message={`Please try generating a new login code. If the problem persists, contact ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for assistance.`}
      />
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
    return (
      <StatusCard
        title="Login successful!"
        description=""
        message="Return to your terminal to continue."
      />
    )
  }

  return (
    <StatusCard
      title="Something went wrong"
      description="We're not sure what happened."
      message={`Please try again and reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem persists.`}
    />
  )
}

export default Onboard
