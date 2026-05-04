'use server'

import { env } from '@codebuff/internal/env'
import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'

import {
  checkFingerprintConflict,
  createCliSession,
  getSessionTokenFromCookies,
  hasCliSessionForAuthHash,
} from './_db'
import { isAuthCodeExpired, parseAuthCode, validateAuthCode } from './_helpers'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card'
import { logger } from '@/util/logger'

function normalizeReferrer(raw: string | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim().slice(0, 50)
  return trimmed || null
}

interface PageProps {
  searchParams?: Promise<{
    auth_code?: string
    referrer?: string
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
  const referrerName = normalizeReferrer(resolvedSearchParams.referrer)
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user) {
    const params = new URLSearchParams()
    if (authCode) params.set('auth_code', authCode)
    if (referrerName) params.set('referrer', referrerName)
    const query = params.toString()
    const dest = authCode ? '/login' : '/get-started'
    return redirect(query ? `${dest}?${query}` : dest)
  }

  if (!authCode) {
    return (
      <StatusCard
        title={
          referrerName
            ? `${referrerName} invited you to try Freebuff!`
            : 'Welcome to Freebuff!'
        }
        description=""
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

  const isReplay = await hasCliSessionForAuthHash(fingerprintHash, user.id)
  if (isReplay) {
    return (
      <StatusCard
        title="Already connected!"
        description="Your account is already connected to your CLI."
        message="Feel free to close this window and head back to your terminal."
      />
    )
  }

  // Log fingerprint collisions as a signal for async abuse review, but don't
  // block login — shared dev machines, Docker images with baked-in machine-ids,
  // and CI runners can legitimately produce the same fingerprint across users.
  const { hasConflict, existingUserId } = await checkFingerprintConflict(
    fingerprintId,
    user.id,
  )
  if (hasConflict) {
    logger.warn(
      { fingerprintId, existingUserId, attemptedUserId: user.id },
      'Fingerprint ownership conflict',
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
