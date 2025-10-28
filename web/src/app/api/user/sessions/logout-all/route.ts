import { NextResponse, NextRequest } from 'next/server'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { and, eq, ne } from 'drizzle-orm'
import { getServerSession } from 'next-auth'
import { cookies } from 'next/headers'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { siteConfig } from '@/lib/constant'

function getCurrentSessionTokenFromCookies(): string | null {
  const jar = cookies()
  // NextAuth may use one of these cookie names depending on secure context
  const names = ['next-auth.session-token', '__Secure-next-auth.session-token']
  for (const name of names) {
    const v = jar.get(name)?.value
    if (v) return v
  }
  return null
}

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

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const currentToken = getCurrentSessionTokenFromCookies()

  if (currentToken) {
    await db.delete(schema.session).where(
      and(
        eq(schema.session.userId, session.user.id),
        ne(schema.session.sessionToken, currentToken),
        eq(schema.session.type, 'web') // Only delete web sessions
      )
    )
  } else {
    await db.delete(schema.session).where(
      and(
        eq(schema.session.userId, session.user.id),
        eq(schema.session.type, 'web') // Only delete web sessions
      )
    )
  }

  return NextResponse.json({ ok: true })
}
