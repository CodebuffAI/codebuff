import { env } from '@/env.mjs'
import { genAuthCode } from 'common/util/credentials'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../[...nextauth]/auth-options'
import { MAX_DATE } from 'common/src/constants'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user || !session.user.email) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  if (!body || !body.authCode) {
    return NextResponse.json(
      {
        error: {
          message: 'No auth code provided or invalid user session.',
        },
      },
      { status: 400 }
    )
  }

  const authCode: string = body.authCode
  // check if auth code is valid
  const [fingerprintId, expiresAt, receivedfingerprintHash] =
    authCode.split('.')
  const fingerprintHash = genAuthCode(
    fingerprintId,
    expiresAt,
    env.NEXTAUTH_SECRET
  )

  if (receivedfingerprintHash !== fingerprintHash) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid auth code.',
        },
      },
      { status: 400 }
    )
  }

  if (expiresAt < Date.now().toString()) {
    return NextResponse.json(
      {
        error: {
          message: 'Auth code expired. Please generate a new code.',
        },
      },
      { status: 400 }
    )
  }

  // If fingerprint already exists, return 409
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
        eq(schema.user.email, session.user.email)
      )
    )
    .limit(1)

  if (fingerprintExists.length > 0) {
    return NextResponse.json(
      { message: 'You already added it! No replay attack for you 👊' },
      { status: 409 }
    )
  }

  await db.insert(schema.session).values({
    sessionToken: crypto.randomUUID(),
    userId: session.user.id,
    expires: MAX_DATE,
    fingerprintId,
    fingerprintHash,
  })

  return NextResponse.json({ status: 'ok' })
}
