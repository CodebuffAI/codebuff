import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'
import { getServerSession } from 'next-auth'
import crypto from 'crypto'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    // Get PAT sessions (type='pat', no fingerprint)
    // CLI sessions are type='cli' and have fingerprint_id
    const patSessions = await db
      .select({
        sessionToken: schema.session.sessionToken,
        expires: schema.session.expires,
        type: schema.session.type,
      })
      .from(schema.session)
      .where(
        and(eq(schema.session.userId, userId), eq(schema.session.type, 'pat'))
      )

    const tokens = patSessions.map((session) => ({
      id: session.sessionToken, // Full token for revocation
      token: `${session.sessionToken.slice(0, 15)}...${session.sessionToken.slice(-8)}`, // Display version
      expires: session.expires?.toISOString(),
      createdAt: null, // PATs don't track creation time separately
      type: 'pat', // Consistent with database type
    }))

    logger.info(
      { userId, tokenCount: tokens.length },
      'Successfully retrieved API Keys'
    )
    return NextResponse.json({ tokens }, { status: 200 })
  } catch (error) {
    logger.error({ error, userId }, 'Failed to retrieve API Keys')
    return NextResponse.json(
      { error: 'Failed to retrieve API Keys' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  const reqJson = await request.json()
  const parsedJson = z
    .object({
      name: z.string().min(1, 'Token name cannot be empty').optional(),
      expiresInDays: z.number().min(1).max(365).optional().default(365),
    })
    .safeParse(reqJson)
  if (!parsedJson.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const { name, expiresInDays } = parsedJson.data

  try {
    // Generate a new session token for the PAT with cb-pat- prefix baked in
    const rawToken = crypto.randomBytes(32).toString('hex')
    const sessionToken = `cb-pat-${rawToken}`

    // Set expiration far in the future to indicate it's a PAT
    const expires = new Date()
    expires.setDate(expires.getDate() + expiresInDays)

    // Create session entry with type='pat' to indicate it's a PAT
    await db.insert(schema.session).values({
      sessionToken,
      userId,
      expires,
      fingerprint_id: null, // This marks it as a PAT
      type: 'pat',
    })

    const tokenDisplay = `${sessionToken.slice(0, 15)}...${sessionToken.slice(-8)}`

    logger.info(
      { userId, tokenDisplay, expiresInDays },
      'Successfully created API Key'
    )

    return NextResponse.json(
      {
        token: sessionToken, // Return full token with prefix already baked in
        expires: expires.toISOString(),
        message: 'API Key created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create API Key')
    return NextResponse.json(
      { error: 'Failed to create API Key' },
      { status: 500 }
    )
  }
}
