import { NextResponse, NextRequest } from 'next/server'
import { getServerSession } from 'next-auth'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { sha256 } from '@/lib/crypto'
import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
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

// DELETE /api/sessions
// Body: { sessionIds?: string[]; tokenIds?: string[] }
export async function DELETE(req: NextRequest) {
  try {
    if (!isSameOrigin(req)) {
      return new NextResponse('Forbidden', { status: 403 })
    }

    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return new NextResponse('Unauthorized', { status: 401 })
    }

    const { sessionIds, tokenIds }: { sessionIds?: string[]; tokenIds?: string[] } = await req
      .json()
      .catch(() => ({} as any))

    if ((!sessionIds || sessionIds.length === 0) && (!tokenIds || tokenIds.length === 0)) {
      return NextResponse.json({ revokedSessions: 0, revokedTokens: 0 })
    }

    const userId = session.user.id
    let revokedSessions = 0
    let revokedTokens = 0

    // 1) Map provided sessionIds (raw token or sha256(token)) to actual session tokens
    if (sessionIds && sessionIds.length > 0) {
      const userSessions = await db
        .select({ sessionToken: schema.session.sessionToken, type: schema.session.type })
        .from(schema.session)
        .where(eq(schema.session.userId, userId))

      const tokenSet = new Set(userSessions.map((s) => s.sessionToken))
      const hashToToken = new Map(
        userSessions.map((s) => [sha256(s.sessionToken), s.sessionToken] as const),
      )

      const tokensToDelete: string[] = []
      for (const provided of sessionIds) {
        if (tokenSet.has(provided)) {
          tokensToDelete.push(provided)
        } else {
          const mapped = hashToToken.get(provided)
          if (mapped) tokensToDelete.push(mapped)
        }
      }

      if (tokensToDelete.length > 0) {
        const result = await db
          .delete(schema.session)
          .where(
            and(
              eq(schema.session.userId, userId),
              eq(schema.session.type, 'web'), // do not delete PATs here
              inArray(schema.session.sessionToken, tokensToDelete),
            ),
          )
          .returning({ sessionToken: schema.session.sessionToken })
        revokedSessions = result.length
      }
    }

    // 2) Revoke API key tokens (PATs) by id (full token string)
    if (tokenIds && tokenIds.length > 0) {
      const result = await db
        .delete(schema.session)
        .where(
          and(
            eq(schema.session.userId, userId),
            eq(schema.session.type, 'pat'),
            inArray(schema.session.sessionToken, tokenIds),
          ),
        )
        .returning({ sessionToken: schema.session.sessionToken })
      revokedTokens = result.length
    }

    return NextResponse.json({ revokedSessions, revokedTokens })
  } catch (e: any) {
    return new NextResponse(e?.message ?? 'Internal error', { status: 500 })
  }
}
