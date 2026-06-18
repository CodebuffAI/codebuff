import { utils } from '@codebuff/internal'
import {
  banSuspects,
  identifyApiAbuseSuspects,
  identifyBotSuspects,
} from '@codebuff/internal/freebuff-abuse'
import { getServerSession } from 'next-auth'
import { NextResponse } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

export const runtime = 'nodejs'
// Suspect identification fans out to the GitHub API and runs several
// aggregate queries; give it room beyond the default.
export const maxDuration = 120

/**
 * Resolve the current session to an admin user, or return a NextResponse
 * error. Admins are `@codebuff.com` accounts or allow-listed emails
 * (see `isCodebuffAdmin`). The page itself renders for everyone; the data
 * and the ban action are gated here, server-side, against the shared
 * Postgres user table.
 */
async function requireAdmin(): Promise<utils.AdminUser | NextResponse> {
  const session = await getServerSession(authOptions)
  const adminUser = await utils.checkSessionIsAdmin(session)
  if (!adminUser) {
    if (session?.user?.id) {
      logger.warn(
        { userId: session.user.id },
        'Non-admin hit freebuff /abuse endpoint',
      )
    }
    return NextResponse.json(
      { error: 'Forbidden — admin access required' },
      { status: session?.user?.id ? 403 : 401 },
    )
  }
  return adminUser
}

const clampInt = (
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number => {
  const n = Number.parseInt(raw ?? '', 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

/**
 * Combined abuse report:
 *   - `apiAbuse`: the strong request-level proxy/farm scanner over a lookback
 *     window (`?hours=`, `?minScore=`). This is the one that catches resellers.
 *   - `session`: behavioral heuristics over currently-active free sessions.
 * Both run in parallel; one failing doesn't sink the other.
 */
export async function GET(req: Request) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  const url = new URL(req.url)
  const hours = clampInt(url.searchParams.get('hours'), 168, 1, 24 * 90)
  const minScore = clampInt(url.searchParams.get('minScore'), 30, 0, 1000)

  const [apiAbuse, session] = await Promise.allSettled([
    identifyApiAbuseSuspects({ logger, hours, minScore }),
    identifyBotSuspects({ logger }),
  ])

  if (apiAbuse.status === 'rejected' && session.status === 'rejected') {
    logger.error(
      { apiAbuse: apiAbuse.reason, session: session.reason },
      'freebuff /abuse report failed (both)',
    )
    return NextResponse.json(
      { error: 'Failed to build suspect report' },
      { status: 500 },
    )
  }
  if (apiAbuse.status === 'rejected') {
    logger.error({ error: apiAbuse.reason }, 'freebuff /abuse api-scan failed')
  }
  if (session.status === 'rejected') {
    logger.error({ error: session.reason }, 'freebuff /abuse session-scan failed')
  }

  return NextResponse.json({
    apiAbuse: apiAbuse.status === 'fulfilled' ? apiAbuse.value : null,
    session: session.status === 'fulfilled' ? session.value : null,
  })
}

/** Ban the selected users (sets banned=true, clears their free sessions). */
export async function POST(req: Request) {
  const admin = await requireAdmin()
  if (admin instanceof NextResponse) return admin

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const userIds = (body as { userIds?: unknown })?.userIds
  if (
    !Array.isArray(userIds) ||
    userIds.length === 0 ||
    !userIds.every((id) => typeof id === 'string')
  ) {
    return NextResponse.json(
      { error: 'Body must be { userIds: string[] } with at least one id' },
      { status: 400 },
    )
  }

  try {
    const result = await banSuspects({ userIds: userIds as string[], logger })
    logger.info(
      {
        adminEmail: admin.email,
        requested: userIds.length,
        banned: result.bannedEmails.length,
      },
      'freebuff /abuse ban action',
    )
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    logger.error({ error }, 'freebuff /abuse ban failed')
    return NextResponse.json({ error: 'Ban failed' }, { status: 500 })
  }
}
