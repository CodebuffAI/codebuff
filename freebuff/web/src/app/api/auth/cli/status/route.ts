import { genAuthCode } from '@codebuff/common/util/credentials'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { and, eq, gt, or, isNull } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { logger } from '@/util/logger'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const reqSchema = z.object({
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
    expiresAt: z.string().transform(Number),
  })
  const result = reqSchema.safeParse({
    fingerprintId: searchParams.get('fingerprintId'),
    fingerprintHash: searchParams.get('fingerprintHash'),
    expiresAt: searchParams.get('expiresAt'),
  })
  if (!result.success) {
    return NextResponse.json(
      { error: 'Invalid query parameters' },
      { status: 400 },
    )
  }

  const { fingerprintId, fingerprintHash, expiresAt } = result.data

  if (Date.now() > expiresAt) {
    logger.info(
      { fingerprintId, fingerprintHash, expiresAt },
      'Auth code expired',
    )
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    )
  }

  const expectedHash = genAuthCode(
    fingerprintId,
    expiresAt.toString(),
    env.NEXTAUTH_SECRET,
  )
  if (fingerprintHash !== expectedHash) {
    logger.info(
      { fingerprintId, fingerprintHash, expectedHash },
      'Invalid auth code',
    )
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    )
  }

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
        eq(schema.session.fingerprint_id, schema.fingerprint.id),
      )
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          or(
            eq(schema.fingerprint.sig_hash, fingerprintHash),
            isNull(schema.fingerprint.sig_hash),
          ),
          gt(schema.session.expires, new Date()),
        ),
      )

    if (users.length === 0) {
      logger.info(
        { fingerprintId, fingerprintHash },
        'No active session found or fingerprint claimed by another user',
      )
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 },
      )
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
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
