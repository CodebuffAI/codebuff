import { NextResponse } from 'next/server'
import { z } from 'zod'
import { and, eq, gt } from 'drizzle-orm'
import db from 'common/db'
import * as schema from 'common/db/schema'
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
    const validDeletion = await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.sessionToken, authToken),
          eq(schema.session.userId, userId),
          gt(schema.session.expires, new Date()),
          eq(schema.session.fingerprint_id, fingerprintId)
        )
      )
      .returning({
        id: schema.session.sessionToken,
      })

    if (validDeletion.length === 0) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    return NextResponse.json({ message: 'Logged out successfully' })
  } catch (error) {
    logger.error({ error }, 'Error logging out')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
