import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq } from 'drizzle-orm'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { siteConfig } from '@/lib/constant'
import { logger } from '@/util/logger'

import type { NextRequest } from 'next/server'

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

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const tokenId = decodeURIComponent(params.id || '')
  if (!tokenId) {
    return NextResponse.json({ error: 'Missing token ID' }, { status: 400 })
  }

  try {
    // Verify the token exists and belongs to the user
    // Only delete PAT sessions (type='pat')
    const patSession = await db
      .select({ sessionToken: schema.session.sessionToken })
      .from(schema.session)
      .where(
        and(
          eq(schema.session.userId, session.user.id),
          eq(schema.session.sessionToken, tokenId),
          eq(schema.session.type, 'pat')
        )
      )
      .then((rows) => rows[0])

    if (!patSession) {
      return NextResponse.json(
        { error: 'Personal Access Token not found' },
        { status: 404 }
      )
    }

    // Delete the PAT session
    await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.userId, session.user.id),
          eq(schema.session.sessionToken, tokenId)
        )
      )

    logger.info(
      { userId: session.user.id, tokenId },
      'Successfully revoked Personal Access Token'
    )

    return NextResponse.json({
      message: 'Personal Access Token revoked successfully',
    })
  } catch (error) {
    logger.error(
      { error, userId: session.user.id, tokenId: tokenId.slice(0, 8) + '...' },
      'Failed to revoke Personal Access Token'
    )
    return NextResponse.json(
      { error: 'Failed to revoke Personal Access Token' },
      { status: 500 }
    )
  }
}
