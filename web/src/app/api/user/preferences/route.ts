import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { z } from 'zod'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { extractApiKeyFromHeader, getUserIdFromSessionToken } from '@/util/auth'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

const updatePreferencesSchema = z.object({
  fallbackToALaCarte: z.boolean().optional(),
})

export async function PATCH(request: NextRequest) {
  let userId: string | undefined

  // First, try Bearer token authentication (for CLI clients)
  const apiKey = extractApiKeyFromHeader(request)
  if (apiKey) {
    const userIdFromToken = await getUserIdFromSessionToken(apiKey)
    if (userIdFromToken) {
      userId = userIdFromToken
    }
  }

  // Fall back to NextAuth session authentication (for web clients)
  if (!userId) {
    const session = await getServerSession(authOptions)
    userId = session?.user?.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = updatePreferencesSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request body', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const { fallbackToALaCarte } = parsed.data

  // Build the update object with only provided fields
  const updates: Partial<{ fallback_to_a_la_carte: boolean }> = {}

  if (fallbackToALaCarte !== undefined) {
    updates.fallback_to_a_la_carte = fallbackToALaCarte
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No updates provided' }, { status: 400 })
  }

  try {
    await db
      .update(schema.user)
      .set(updates)
      .where(eq(schema.user.id, userId))

    logger.info({ userId, updates }, 'User preferences updated')

    return NextResponse.json({ success: true, ...parsed.data })
  } catch (error) {
    logger.error({ error, userId }, 'Error updating user preferences')
    return NextResponse.json(
      { error: 'Failed to update preferences' },
      { status: 500 },
    )
  }
}

export async function GET(request: NextRequest) {
  let userId: string | undefined

  // First, try Bearer token authentication (for CLI clients)
  const apiKey = extractApiKeyFromHeader(request)
  if (apiKey) {
    const userIdFromToken = await getUserIdFromSessionToken(apiKey)
    if (userIdFromToken) {
      userId = userIdFromToken
    }
  }

  // Fall back to NextAuth session authentication (for web clients)
  if (!userId) {
    const session = await getServerSession(authOptions)
    userId = session?.user?.id
  }

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { fallback_to_a_la_carte: true },
  })

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  return NextResponse.json({
    fallbackToALaCarte: user.fallback_to_a_la_carte,
  })
}
