import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { and, eq, gt } from 'drizzle-orm'

import type { NextRequest } from 'next/server'

/**
 * Look up user ID from a session token in the database.
 * Returns null if the token is invalid or expired.
 */
export async function getUserIdFromSessionToken(
  sessionToken: string,
): Promise<string | null> {
  const session = await db.query.session.findFirst({
    where: and(
      eq(schema.session.sessionToken, sessionToken),
      gt(schema.session.expires, new Date()),
    ),
    columns: { userId: true },
  })
  return session?.userId ?? null
}

/**
 * Extract api key from x-codebuff-api-key header or authorization header
 */
export function extractApiKeyFromHeader(req: NextRequest): string | undefined {
  const token = req.headers.get('x-codebuff-api-key')
  if (typeof token === 'string' && token) {
    return token
  }

  const authorization = req.headers.get('Authorization')
  if (!authorization) {
    return undefined
  }
  if (!authorization.startsWith('Bearer ')) {
    return undefined
  }
  return authorization.slice('Bearer '.length)
}
