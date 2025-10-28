import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { sha256 } from '@/lib/crypto'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

// Helper: revoke web/cli sessions for a user
async function revokeStandardSessions(
  userId: string,
  providedSessionIds: string[]
) {
  // Load user sessions (token, type, fingerprint)
  const userSessions = await db
    .select({
      sessionToken: schema.session.sessionToken,
      type: schema.session.type,
      fingerprintId: schema.session.fingerprint_id,
    })
    .from(schema.session)
    .where(eq(schema.session.userId, userId))

  // Map provided ids which may be raw tokens or sha256(token)
  const tokenSet = new Set(userSessions.map((s) => s.sessionToken))
  const hashToToken = new Map(
    userSessions.map((s) => [sha256(s.sessionToken), s.sessionToken] as const)
  )

  const tokensToDelete: string[] = []
  for (const provided of providedSessionIds) {
    if (tokenSet.has(provided)) tokensToDelete.push(provided)
    else {
      const mapped = hashToToken.get(provided)
      if (mapped) tokensToDelete.push(mapped)
    }
  }

  if (tokensToDelete.length === 0) return 0

  // Restrict to web/cli sessions only
  const sessionsToDelete = userSessions.filter(
    (s) =>
      tokensToDelete.includes(s.sessionToken) &&
      (s.type === 'web' || s.type === 'cli')
  )

  const cliFingerprintIds = Array.from(
    new Set(
      sessionsToDelete
        .filter((s) => s.type === 'cli' && s.fingerprintId)
        .map((s) => s.fingerprintId!)
    )
  )

  // Unclaim CLI fingerprints and delete sessions in a single transaction
  const deleted = await db.transaction(async (tx) => {
    if (cliFingerprintIds.length > 0) {
      await tx
        .update(schema.fingerprint)
        .set({ sig_hash: null })
        .where(inArray(schema.fingerprint.id, cliFingerprintIds))
    }

    const del = await tx
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.userId, userId),
          inArray(schema.session.sessionToken, tokensToDelete),
          // Explicitly restrict to web/cli to avoid PATs here
          inArray(schema.session.type, ['web', 'cli'] as any)
        )
      )
      .returning({ sessionToken: schema.session.sessionToken })

    return del.length
  })

  return deleted
}

// Helper: revoke PAT tokens for a user
async function revokeApiTokens(userId: string, tokenIds: string[]) {
  if (!tokenIds || tokenIds.length === 0) return 0
  const result = await db
    .delete(schema.session)
    .where(
      and(
        eq(schema.session.userId, userId),
        eq(schema.session.type, 'pat'),
        inArray(schema.session.sessionToken, tokenIds)
      )
    )
    .returning({ sessionToken: schema.session.sessionToken })
  return result.length
}

// DELETE /api/sessions
// Body: { sessionIds?: string[]; tokenIds?: string[] }
export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const {
      sessionIds,
      tokenIds,
    }: { sessionIds?: string[]; tokenIds?: string[] } = await req
      .json()
      .catch(() => ({}) as any)

    const userId = session.user.id

    if (
      (!sessionIds || sessionIds.length === 0) &&
      (!tokenIds || tokenIds.length === 0)
    ) {
      return NextResponse.json({ revokedSessions: 0, revokedTokens: 0 })
    }

    let revokedSessions = 0
    let revokedTokens = 0

    if (sessionIds && sessionIds.length > 0) {
      revokedSessions = await revokeStandardSessions(userId, sessionIds)
    }

    if (tokenIds && tokenIds.length > 0) {
      revokedTokens = await revokeApiTokens(userId, tokenIds)
    }

    return NextResponse.json({ revokedSessions, revokedTokens })
  } catch (e: any) {
    logger.error(
      { error: e?.message ?? String(e), stack: e?.stack },
      'Error in DELETE /api/sessions'
    )
    return new NextResponse(e?.message ?? 'Internal error', { status: 500 })
  }
}
