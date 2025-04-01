import { NextResponse } from 'next/server'
import { z } from 'zod'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'
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

    if (validDeletion.length === 0) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
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
