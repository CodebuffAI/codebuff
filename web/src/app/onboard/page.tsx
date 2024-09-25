'use server'

import { toast } from '@/components/ui/use-toast'
import { getServerSession } from 'next-auth'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'
import { MAX_DATE } from 'common/src/constants'
import { authOptions } from '../api/auth/[...nextauth]/auth-options'
import { genAuthCode } from 'common/util/credentials'
import { env } from '@/env.mjs'
import CardWithBeams from '@/components/card-with-beams'

interface PageProps {
  searchParams: {
    auth_code?: string
  }
}

const Onboard = async ({ searchParams }: PageProps) => {
  const authCode = searchParams.auth_code
  const session = await getServerSession(authOptions)
  const user = session?.user

  if (!authCode || !user) {
    toast({
      title: 'Uh-oh, spaghettio!',
      description:
        'No valid session or auth code. Please try again and reach out to support@manicode.ai if the problem persists.',
    })
    return notFound()
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
    .where(
      and(
        eq(schema.session.fingerprintId, fingerprintId),
        eq(schema.session.fingerprintHash, fingerprintHash),
        eq(schema.user.id, user.id)
      )
    )
    .limit(1)
  if (fingerprintExists.length > 0) {
    return CardWithBeams({
      title: 'You already added it!',
      description:
        'Feel free to close this window and head back to your terminal. Enjoy the extra api credits!',
      content: <p>No replay attack for you 👊</p>,
    })
  }

  // Add it to the db
  const insertResult = await db
    .insert(schema.session)
    .values({
      sessionToken: crypto.randomUUID(),
      userId: user.id,
      expires: MAX_DATE,
      fingerprintId,
      fingerprintHash,
    })
    .returning({
      userId: schema.session.userId,
    })
  if (insertResult.length > 0) {
    return CardWithBeams({
      title: 'Nicely done!',
      description:
        'Feel free to close this window and head back to your terminal. Enjoy the extra api credits!',
      content: (
        <Image
          src="/auth-success.jpg"
          alt="Successful authentication"
          width={600}
          height={600}
        />
      ),
    })
  }

  return CardWithBeams({
    title: 'Uh-oh, spaghettio!',
    description: 'Something went wrong.',
    content: (
      <p>
        Please try again and reach out to support@manicode.ai if the problem
        persists.
      </p>
    ),
  })
}

export default Onboard
