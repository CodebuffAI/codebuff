import { randomBytes } from 'node:crypto'

import { genAuthCode } from '@codebuff/common/util/credentials'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { env } from '@codebuff/internal/env'
import { and, eq, gt } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import {
  buildCliAuthCode,
  getCliAuthCodeHashPrefix,
  getCliAuthCodeTokenIdentifier,
} from '@/app/onboard/_helpers'
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
          gt(schema.session.expires, new Date()),
        ),
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
        'Login attempt for fingerprint with active session',
      )
    }

    const authCode = buildCliAuthCode(
      fingerprintId,
      expiresAt.toString(),
      fingerprintHash,
    )
    const loginToken = randomBytes(32).toString('base64url')

    await db.insert(schema.verificationToken).values({
      identifier: getCliAuthCodeTokenIdentifier(loginToken),
      token: authCode,
      expires: new Date(expiresAt),
    })

    const loginUrl = new URL(
      '/login',
      getLoginUrlOrigin(
        req,
        env.NEXT_PUBLIC_CODEBUFF_APP_URL,
        'https://codebuff.com',
        env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod',
      ),
    )
    loginUrl.searchParams.set('auth_code', loginToken)

    logger.info(
      {
        authCodeTokenHashPrefix: getCliAuthCodeHashPrefix(loginToken),
        authCodeTokenLength: loginToken.length,
        fingerprintIdPrefix: fingerprintId.slice(0, 24),
        fingerprintIdLength: fingerprintId.length,
        expiresAt,
        loginUrlOrigin: loginUrl.origin,
        requestOrigin: new URL(req.url).origin,
        requestHost: req.headers.get('host'),
        forwardedHost: req.headers.get('x-forwarded-host'),
        forwardedProto: req.headers.get('x-forwarded-proto'),
        originHeader: req.headers.get('origin'),
        configuredAppUrl: env.NEXT_PUBLIC_CODEBUFF_APP_URL,
        environment: env.NEXT_PUBLIC_CB_ENVIRONMENT,
      },
      'Issued Codebuff CLI auth code token',
    )

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
