import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { utils } from '@codebuff/internal'
import { eq } from 'drizzle-orm'

import { logger } from './logger'

import type { ServerAction } from '@codebuff/common/actions'

export const checkAuth = async ({
  fingerprintId,
  authToken,
  clientSessionId,
}: {
  fingerprintId?: string
  authToken?: string
  clientSessionId: string
}): Promise<void | ServerAction> => {
  const authResult = await utils.checkAuthToken({ fingerprintId, authToken })
  if (!authResult.success) {
    const errorMessage = authResult.error?.message || 'Authentication failed'
    logger.error({ clientSessionId, error: errorMessage }, errorMessage)
    return { type: 'action-error', message: errorMessage }
  }
  return
}

export const checkAdmin = async (req: Request): Promise<void> => {
  const httpError = (status: number, message: string) =>
    Object.assign(new Error(message), { status }) as Error & { status: number }

  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw httpError(401, 'Missing or invalid Authorization header')
  }
  const authToken = authHeader.substring(7)

  const clientSessionId = `admin-relabel-${Date.now()}`
  const authResult = await checkAuth({ authToken, clientSessionId })
  if (authResult) {
    const errorMessage =
      authResult.type === 'action-error'
        ? authResult.message
        : 'Authentication failed'
    throw httpError(401, errorMessage)
  }

  const user = await db
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => users[0])

  if (!user) {
    throw httpError(401, 'Invalid session')
  }

  const adminUser = await utils.checkUserIsCodebuffAdmin(user.id)
  if (!adminUser) {
    logger.warn(
      { userId: user.id, email: user.email, clientSessionId },
      'Unauthorized access attempt to admin endpoint',
    )
    throw httpError(403, 'Forbidden')
  }

  // success: do nothing
  return
}
