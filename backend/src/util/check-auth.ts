import { match, P } from 'ts-pattern'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { ServerAction } from 'common/actions'
import { sql, eq } from 'drizzle-orm'
import { genUsageResponse } from '../websockets/websocket-action'
import { getNextQuotaReset } from 'common/util/dates'
import { AnonymousQuotaManager, AuthenticatedQuotaManager } from 'common/billing/quota-manager'
import { env } from '../env.mjs'

export async function checkAuth(params: {
  fingerprintId?: string
  authToken?: string
  clientSessionId?: string
}): Promise<ServerAction | undefined> {
  if (!params.fingerprintId) {
    return {
      type: 'action-error' as const,
      message: 'Access denied. Missing fingerprintId.'
    }
  }

  return match(params)
    .with(
      { authToken: P.string, fingerprintId: P.string },
      async ({ authToken, fingerprintId, clientSessionId }) => {
        const quota = await db.select({
          userId: schema.user.id,
          quotaExceeded: sql<boolean>`COALESCE(${schema.user.quota_exceeded}, false)`,
          nextQuotaReset: sql<string>`COALESCE(${schema.user.next_quota_reset}, now())`
        })
        .from(schema.user)
        .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
        .where(eq(schema.session.sessionToken, authToken))
        .limit(1)
        .then(rows => rows[0])

        if (!quota) {
          return {
            type: 'action-error' as const,
            message: `Unable to find user for given token! Please reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
          }
        }

        const currentQuotaReset = new Date(quota.nextQuotaReset)
        if (currentQuotaReset <= new Date()) {
          const nextQuotaReset = getNextQuotaReset(currentQuotaReset)
          await Promise.all([
            new AnonymousQuotaManager().setNextQuota(
              fingerprintId,
              false,
              nextQuotaReset
            ),
            new AuthenticatedQuotaManager().setNextQuota(
              quota.userId,
              false,
              nextQuotaReset
            )
          ])
          return undefined
        }

        if (quota.quotaExceeded) {
          return genUsageResponse(fingerprintId, quota.userId, clientSessionId)
        }

        return undefined
      }
    )
    .otherwise(() => ({
      type: 'action-error' as const,
      message: 'Access denied. Missing auth token, please enter "login" to continue.'
    }))
}