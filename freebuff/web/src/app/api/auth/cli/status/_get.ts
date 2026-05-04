import { genAuthCode } from '@codebuff/common/util/credentials'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import type { LoginStatusDb } from './_db'
import type { Logger } from '@codebuff/common/types/contracts/logger'

export type { LoginStatusDb } from './_db'

interface GetLoginStatusDeps {
  req: Request
  db: LoginStatusDb
  logger: Logger
  secret: string
  now?: () => number
}

const reqSchema = z.object({
  fingerprintId: z.string(),
  fingerprintHash: z.string(),
  expiresAt: z.coerce.number().finite().int().positive(),
})

export async function getLoginStatus({
  req,
  db,
  logger,
  secret,
  now = Date.now,
}: GetLoginStatusDeps): Promise<NextResponse> {
  const { searchParams } = new URL(req.url)
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

  if (now() > expiresAt) {
    logger.info(
      { fingerprintId, fingerprintHash, expiresAt },
      'Auth code expired',
    )
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 401 },
    )
  }

  const expectedHash = genAuthCode(fingerprintId, expiresAt.toString(), secret)
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
    const user = await db.getCliSessionForAuth(fingerprintId, fingerprintHash)

    if (!user) {
      logger.info(
        { fingerprintId, fingerprintHash },
        'No active CLI session found for login auth code',
      )
      return NextResponse.json(
        { error: 'Authentication failed' },
        { status: 401 },
      )
    }

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
