import { env } from '@/env.mjs'
import { genAuthCode } from 'common/util/credentials'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, isNull, sql } from 'drizzle-orm'
import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../[...nextauth]/auth-options'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session || !session.user) {
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
  const [fingerprintId, expiresAt, authCodeHash] = authCode.split('.')
  const calculatedAuthCode = genAuthCode(
    fingerprintId,
    expiresAt,
    env.NEXTAUTH_SECRET
  )

  if (authCodeHash !== calculatedAuthCode) {
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

  // add fingerprint to database if it doesn't already exist
  const sessionToken = await db
    .update(schema.sessions)
    .set({
      fingerprintId,
    })
    .where(
      and(
        sql`${session.user.email} IN (SELECT ${schema.users.email} FROM ${schema.users})`,
        isNull(schema.sessions.fingerprintId)
      )
    )
    .returning({
      sessionToken: schema.sessions.sessionToken,
    })

  if (!sessionToken.length) {
    return NextResponse.json(
      { message: 'You already added it! No replay attack for you 👊' },
      { status: 401 }
    )
  }

  return NextResponse.json({ status: 'ok' })
}
