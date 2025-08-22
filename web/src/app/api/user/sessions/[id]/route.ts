import { NextResponse, NextRequest } from 'next/server'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
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

  const id = decodeURIComponent(params.id || '')
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 })
  }

  // Try direct delete by token (backward compatible)
  const direct = await db
    .select({ token: schema.session.sessionToken, type: schema.session.type })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.userId, session.user.id),
        eq(schema.session.sessionToken, id),
        // Only allow deletion of web sessions, not PATs
        eq(schema.session.type, 'web')
      )
    )

  if (direct.length > 0) {
    await db
      .delete(schema.session)
      .where(
        and(
          eq(schema.session.userId, session.user.id),
          eq(schema.session.sessionToken, id)
        )
      )
    return NextResponse.json({ ok: true })
  }

  // Fallback: resolve hashed id -> token
  const rows = await db
    .select({ token: schema.session.sessionToken, type: schema.session.type })
    .from(schema.session)
    .where(
      and(
        eq(schema.session.userId, session.user.id),
        // Only allow deletion of web sessions, not PATs
        eq(schema.session.type, 'web')
      )
    )

  const match = rows.find((r) => sha256(r.token) === id)
  if (!match) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db
    .delete(schema.session)
    .where(
      and(
        eq(schema.session.userId, session.user.id),
        eq(schema.session.sessionToken, match.token)
      )
    )

  return NextResponse.json({ ok: true })
}
