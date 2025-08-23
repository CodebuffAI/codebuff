import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq, and, not } from 'drizzle-orm/expressions'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { sha256 } from '@/lib/crypto'

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

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get sessions excluding PATs
  const rows = await db
    .select({
      sessionToken: schema.session.sessionToken,
      expires: schema.session.expires,
      fingerprint_id: schema.session.fingerprint_id,
      fingerprintCreatedAt: schema.fingerprint.created_at,
      type: schema.session.type,
    })
    .from(schema.session)
    .leftJoin(
      schema.fingerprint,
      eq(schema.session.fingerprint_id, schema.fingerprint.id)
    )
    .where(
      and(
        eq(schema.session.userId, session.user.id),
        not(eq(schema.session.type, 'pat'))
      )
    )

  const currentToken = getCurrentSessionTokenFromCookies()

  // Collect all active sessions (non-PAT sessions)
  const activeSessions: any[] = []

  for (const r of rows) {
    const token = r.sessionToken
    const label = token ? `••••${token.slice(-4)}` : '••••'

    // All non-PAT sessions are now unified as 'web' type
    activeSessions.push({
      id: sha256(token),
      label,
      expires: r.expires.toISOString(),
      isCurrent: token === currentToken,
      fingerprintId: r.fingerprint_id,
      createdAt: r.fingerprintCreatedAt?.toISOString() ?? null,
      sessionType: r.type,
    })
  }

  return NextResponse.json({ activeSessions })
}
