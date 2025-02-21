import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { logger } from '@/util/logger'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const reqSchema = z.object({
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
  })
  const result = reqSchema.safeParse({
    fingerprintId: searchParams.get('fingerprintId'),
    fingerprintHash: searchParams.get('fingerprintHash'),
  })
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid query parameters' }, { status: 400 })
  }

  const { fingerprintId, fingerprintHash } = result.data

  try {
    const users = await db
      .select({
        id: schema.user.id,
        email: schema.user.email,
        name: schema.user.name,
        authToken: schema.session.sessionToken,
      })
      .from(schema.user)
      .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
      .leftJoin(
        schema.fingerprint,
        eq(schema.session.fingerprint_id, schema.fingerprint.id)
      )
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          eq(schema.fingerprint.sig_hash, fingerprintHash),
          gt(schema.session.expires, new Date()) // Only return active sessions
        )
      )

    if (users.length === 0) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
    }

    const user = users[0]
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        authToken: user.authToken,
        fingerprintId,
        fingerprintHash,
      },
      message: 'Authentication successful!',
    })
  } catch (error) {
    logger.error({ error }, 'Error checking login status')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
