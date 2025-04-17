import { eq, sql } from 'drizzle-orm'

import db from 'common/db'
import * as schema from 'common/db/schema'
import { ServerAction } from 'common/actions'
import { logger } from '@/util/logger'

export const checkAuth = async ({
  fingerprintId,
  authToken,
  clientSessionId,
}: {
  fingerprintId?: string
  authToken?: string
  clientSessionId: string
}): Promise<void | ServerAction> => {
  if (!authToken) {
    if (!fingerprintId) {
      logger.error(
        { clientSessionId },
        'Auth token and fingerprint ID are missing'
      )
      return {
        type: 'action-error',
        message: 'Auth token and fingerprint ID are missing',
      }
    }
    return
  }

  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
      discord_id: schema.user.discord_id,
    })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => {
      if (users.length === 1) {
        return users[0]
      }
      return undefined
    })

  if (!user) {
    logger.warn({ clientSessionId }, 'Invalid auth token')
    return {
      type: 'action-error',
      message: 'Invalid auth token',
    }
  }

  return
}
