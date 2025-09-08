import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { INVALID_AUTH_TOKEN_MESSAGE } from '@codebuff/common/old-constants'

import { logger } from '@/util/logger'

export async function POST(req: Request) {
  const reqSchema = z.object({
    authToken: z.string(),
    userId: z.string(),
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
  })
  const result = reqSchema.safeParse(await req.json())
  if (!result.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { authToken, userId, fingerprintId } = result.data

  try {
    // First delete the session
    const validDeletion = await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.sessionToken, authToken),
          eq(schema.session.userId, userId),
          eq(schema.session.fingerprint_id, fingerprintId)
        )
      )
      .returning({
        id: schema.session.sessionToken,
      })

    // If no session was deleted, it means the token was already invalid or the user was already logged out.
    // This is effectively a no-op, so we treat it as a successful logout rather than an error.
    if (validDeletion.length === 0) {
      logger.info(
        { fingerprintId },
        'Logout attempted with invalid/expired token - treating as successful no-op'
      )
      return NextResponse.json({ success: true })
    }

    // Then reset sig_hash to null
    await db
      .update(schema.fingerprint)
      .set({ sig_hash: null })
      .where(eq(schema.fingerprint.id, fingerprintId))

    logger.info({ fingerprintId }, 'Fingerprint marked as unclaimed')

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'Error during logout')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
