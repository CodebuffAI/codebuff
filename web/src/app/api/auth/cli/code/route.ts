import { NextResponse } from 'next/server'
import { z } from 'zod'
import { env } from '@/env.mjs'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { genAuthCode } from 'common/util/credentials'
import { logger } from '@/util/logger'

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
    // Insert fingerprint if not exists
    await db
      .insert(schema.fingerprint)
      .values({
        id: fingerprintId,
      })
      .onConflictDoNothing()

    const expiresAt = Date.now() + 60 * 60 * 1000 // 1 hour
    const fingerprintHash = genAuthCode(
      fingerprintId,
      expiresAt.toString(),
      env.NEXTAUTH_SECRET
    )

    const loginUrl = `${env.NEXT_PUBLIC_APP_URL}/login?auth_code=${fingerprintId}.${expiresAt}.${fingerprintHash}${
      referralCode ? `&referral_code=${referralCode}` : ''
    }`

    return NextResponse.json({ fingerprintId, fingerprintHash, loginUrl })
  } catch (error) {
    logger.error({ error }, 'Error generating login code')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
