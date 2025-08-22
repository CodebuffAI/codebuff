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
import { siteConfig } from '@/lib/constant'

function isSameOrigin(request: NextRequest) {
  try {
    const base = new URL(siteConfig.url()).origin
    const origin = request.headers.get('origin')
    const referer = request.headers.get('referer')
    if (origin && new URL(origin).origin === base) return true
    if (referer && new URL(referer).origin === base) return true
  } catch {}
  return false
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  let userId: string | null = null
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const authToken = authHeader.split(' ')[1]
    const user = await db.query.session.findFirst({
      where: eq(schema.session.sessionToken, authToken),
      columns: { userId: true },
    })
    userId = user?.userId ?? null
  } else {
    const session = await getServerSession(authOptions)
    userId = session?.user?.id ?? null
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      'Successfully retrieved Personal Access Tokens'
    )
    return NextResponse.json({ tokens }, { status: 200 })
  } catch (error) {
    logger.error({ error, userId }, 'Failed to retrieve Personal Access Tokens')
    return NextResponse.json(
      { error: 'Failed to retrieve Personal Access Tokens' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const reqJson = await request.json()
  const parsedJson = z
    .object({
      name: z.string().min(1, 'Token name cannot be empty').optional(),
      expiresInDays: z.number().min(1).max(365).optional().default(365),
      authToken: z.string().optional(),
    })
    .safeParse(reqJson)
  if (!parsedJson.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Enforce CSRF for browser requests (skip for CLI auth)
  const hasCliAuth =
    !!parsedJson.data.authToken ||
    (request.headers.get('authorization') || '').startsWith('Bearer ')
  if (!hasCliAuth && !isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, expiresInDays, authToken } = parsedJson.data

  // Resolve userId from either provided authToken (CLI) or cookie session (web)
  let userId: string | null = null
  if (authToken) {
    // authToken should already include cb-pat- prefix
    const user = await db.query.session.findFirst({
      where: eq(schema.session.sessionToken, authToken),
      columns: { userId: true },
    })
    userId = user?.userId ?? null
  } else {
    const session = await getServerSession(authOptions)
    userId = session?.user?.id ?? null
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
      'Successfully created Personal Access Token'
    )

    return NextResponse.json(
      {
        token: sessionToken, // Return full token with prefix already baked in
        expires: expires.toISOString(),
        message: 'Personal Access Token created successfully',
      },
      { status: 201 }
    )
  } catch (error) {
    logger.error({ error, userId }, 'Failed to create Personal Access Token')
    return NextResponse.json(
      { error: 'Failed to create Personal Access Token' },
      { status: 500 }
    )
  }
}
