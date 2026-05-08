import { randomBytes } from 'node:crypto'

import { genAuthCode } from '@codebuff/common/util/credentials'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { and, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { logger } from '@/util/logger'

import { getLoginUrlOrigin } from './_origin'

export async function POST(req: Request) {
  const reqSchema = z.object({
    fingerprintId: z.string(),
  })
  const requestBody = await req.json()
  const result = reqSchema.safeParse(requestBody)
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { fingerprintId } = result.data

  try {
    const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour
    const fingerprintHash = genAuthCode(
      fingerprintId,
      expiresAt.toString(),
      env.NEXTAUTH_SECRET,
    )

    const existingSession = await db
      .select({
        userId: schema.session.userId,
        expires: schema.session.expires,
      })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.fingerprint_id, fingerprintId),
          gt(schema.session.expires, new Date()),
        ),
      )
      .limit(1)

    if (existingSession.length > 0) {
      logger.info(
        {
          fingerprintId,
          existingUserId: existingSession[0].userId,
          event: 'relogin_attempt_with_active_session',
        },
        'Login attempt for fingerprint with active session',
      )
    }

    const authCode = `${fingerprintId}.${expiresAt}.${fingerprintHash}`
    const loginToken = randomBytes(32).toString('base64url')

    await db.insert(schema.verificationToken).values({
      identifier: `cli-login:${loginToken}`,
      token: authCode,
      expires: new Date(expiresAt),
    })

    const loginUrl = new URL(
      '/login',
      getLoginUrlOrigin(
        req,
        env.NEXT_PUBLIC_CODEBUFF_APP_URL,
        'https://freebuff.com',
        env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod',
      ),
    )
    loginUrl.searchParams.set('auth_code', loginToken)

    return NextResponse.json({
      fingerprintId,
      fingerprintHash,
      loginUrl: loginUrl.toString(),
      expiresAt,
    })
  } catch (error) {
    logger.error({ error }, 'Error generating login code')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
