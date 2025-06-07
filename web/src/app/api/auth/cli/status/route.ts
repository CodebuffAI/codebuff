import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, gt, or, isNull } from 'drizzle-orm'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { logger } from '@/util/logger'
import { genAuthCode } from 'common/util/credentials'
import { env } from '@/env.mjs'

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
      { status: 400 }
    )
  }

  const { fingerprintId, fingerprintHash, expiresAt } = result.data

  // Check if code has expired
  if (Date.now() > expiresAt) {
    logger.info(
      { fingerprintId, fingerprintHash, expiresAt },
      'Auth code expired'
    )
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
    )
  }

  // Validate the auth code
  const expectedHash = genAuthCode(
    fingerprintId,
    expiresAt.toString(),
    env.NEXTAUTH_SECRET
  )
  if (fingerprintHash !== expectedHash) {
    logger.info(
      { fingerprintId, fingerprintHash, expectedHash },
      'Invalid auth code'
    )
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 }
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
        eq(schema.session.fingerprint_id, schema.fingerprint.id)
      )
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          // Allow access if either:
          // 1. The fingerprint's sig_hash matches what the user provided (they own it)
          // 2. The fingerprint's sig_hash is null (it's unclaimed/abandoned)
          or(
            eq(schema.fingerprint.sig_hash, fingerprintHash),
            isNull(schema.fingerprint.sig_hash)
          ),
          gt(schema.session.expires, new Date()) // Only return active sessions
        )
      )

    if (users.length === 0) {
      // No active session found - either:
      // - This is a new fingerprint
      // - The fingerprint exists but has no active session
      // - The fingerprint is claimed by someone else (sig_hash mismatch)
      logger.info(
        { fingerprintId, fingerprintHash },
        'No active session found or fingerprint claimed by another user'
      )
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 }
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
      { status: 500 }
    )
  }
}
