import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/env.mjs'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { genAuthCode } from 'common/util/credentials'
import { logger } from '@/util/logger'
import { and, eq, gt } from 'drizzle-orm'

export async function POST(req: Request) {
  const reqSchema = z.object({
    fingerprintId: z.string(),
    referralCode: z.string().optional(),
  })
  const result = reqSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { fingerprintId, referralCode } = result.data

  try {
    const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour
    const fingerprintHash = genAuthCode(
      fingerprintId,
      expiresAt.toString(),
      env.NEXTAUTH_SECRET
    )

    // Check if this fingerprint has any active sessions
    const existingSession = await db
      .select({
        userId: schema.session.userId,
        expires: schema.session.expires,
      })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          gt(schema.session.expires, new Date())
        )
      )
      .limit(1)

    if (existingSession.length > 0) {
      // There's an active session - log this for monitoring
      logger.info(
        {
          fingerprintId,
          existingUserId: existingSession[0].userId,
          event: 'relogin_attempt_with_active_session',
        },
        'Login attempt for fingerprint with active session'
      )
    }

    // Generate login URL without modifying the fingerprint record
    const loginUrl = `${env.NEXT_PUBLIC_APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}${
      referralCode ? `&referral_code=${referralCode}` : ''
    }`

    return NextResponse.json({
      fingerprintId,
      fingerprintHash,
      loginUrl,
      expiresAt,
    })
  } catch (error) {
    logger.error({ error }, 'Error generating login code')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
