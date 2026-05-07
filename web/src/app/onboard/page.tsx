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

import CardWithBeams from '@/components/card-with-beams'
import { WelcomeCard } from '@/components/onboard/welcome-card'
import { logger } from '@/util/logger'

interface PageProps {
  searchParams?: Promise<{
    auth_code?: string
  }>
}

const Onboard = async ({ searchParams }: PageProps) => {
  const resolvedSearchParams = searchParams ? await searchParams : {}
  const authCode = resolvedSearchParams.auth_code
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!user) {
    const params = new URLSearchParams()
    if (authCode) params.set('auth_code', authCode)
    const query = params.toString()
    return redirect(
      query ? `/login?${query}` : env.NEXT_PUBLIC_CODEBUFF_APP_URL,
    )
  }

  if (!authCode) {
    return (
      <WelcomeCard
        fallbackTitle="Welcome to Codebuff!"
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
      <CardWithBeams
        title="Uh-oh, spaghettio!"
        description="Invalid auth code."
        content={
          <p>
            Please try again and reach out to support@codebuff.com if the
            problem persists.
          </p>
        }
      />
    )
  }

  if (isAuthCodeExpired(expiresAt)) {
    return (
      <CardWithBeams
        title="Uh-oh, spaghettio!"
        description="Auth code expired."
        content={
          <p>
            Please generate a new code and reach out to support@codebuff.com if
            the problem persists.
          </p>
        }
      />
    )
  }

  const isReplay = await hasCliSessionForAuthHash(fingerprintHash, user.id)
  if (isReplay) {
    return (
      <CardWithBeams
        title="Your account is already connected to your CLI!"
        description="Feel free to close this window and head back to your terminal."
        content={<p>No replay attack for you 👊</p>}
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
      <WelcomeCard
        fallbackTitle="Login successful!"
        description=""
        message="Return to your terminal to continue."
      />
    )
  }

  return (
    <CardWithBeams
      title="Uh-oh, spaghettio!"
      description="Something went wrong."
      content={
        <p>
          Not sure what happened. Please try again and reach out to{' '}
          {env.NEXT_PUBLIC_SUPPORT_EMAIL} if the problem persists.
        </p>
      }
    />
  )
}

export default Onboard
