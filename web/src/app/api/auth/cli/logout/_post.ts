import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { extractApiKeyFromHeader } from '@/util/auth'

import { shouldUnclaim } from './_helpers'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'
import type { FingerprintData, LogoutDb } from './_db'

// Re-export for tests
export type { LogoutDb } from './_db'
export { createLogoutDb } from './_db'

export interface PostLogoutDeps {
  req: NextRequest
  db: LogoutDb
  logger: Logger
}

const reqSchema = z.object({
  authToken: z.string().optional(), // Deprecated: use Authorization header
  userId: z.string(),
  fingerprintId: z.string(),
  fingerprintHash: z.string(),
})

export async function postLogout({
  req,
  db,
  logger,
}: PostLogoutDeps): Promise<NextResponse> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = reqSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const {
    authToken: bodyToken,
    userId,
    fingerprintId,
    fingerprintHash,
  } = parsed.data
  const authToken = extractApiKeyFromHeader(req) ?? bodyToken

  if (!authToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const tokenSessions = await db.getSessionByToken(authToken, userId)
    const tokenValid = tokenSessions.length > 0
    if (!tokenValid) {
      return NextResponse.json({ success: true })
    }

    const fingerprintSessionsDeleted = await db.deleteSessionsByFingerprint(
      userId,
      fingerprintId,
    )
    const fingerprintMatchFound = fingerprintSessionsDeleted.length > 0

    // Always fetch fingerprint data for subsequent logic
    const fingerprintRows = await db.getFingerprintData(fingerprintId)
    const fingerprintData = fingerprintRows[0]

    if (fingerprintMatchFound) {
      // Also clean up orphaned web sessions (fingerprint_id = null) for this user
      await db.deleteOrphanedWebSessions(userId)
    } else if (fingerprintData?.created_at) {
      // Intermediate strategy: delete web sessions created around the same time as the fingerprint
      const timeWindowDeleted = await db.deleteWebSessionsInTimeWindow(
        userId,
        fingerprintData.created_at,
      )
      if (timeWindowDeleted.length === 0) {
        // Final fallback: delete all web sessions when time-window deletion finds nothing
        await db.deleteAllWebSessions(userId)
      }
    } else {
      // No fingerprint data available, fall back to deleting all web sessions
      await db.deleteAllWebSessions(userId)
    }

    const storedHash = fingerprintData?.sig_hash
    const canUnclaim = shouldUnclaim(
      fingerprintMatchFound,
      storedHash,
      fingerprintHash,
    )

    if (canUnclaim) {
      await db.unclaimFingerprint(fingerprintId)
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error, userId, fingerprintId }, 'Error during CLI logout')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
