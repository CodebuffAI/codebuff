import { WebSocket } from 'ws'
import { ClientAction } from 'common/actions'
import { match, P } from 'ts-pattern'
import db from 'common/db'
import * as schema from 'common/db/schema'
import {
  AnonymousQuotaManager,
  AuthenticatedQuotaManager,
} from '../billing/quota-manager'
import { sql, eq } from 'drizzle-orm'
import { sendUsageInfo, sendAction } from './websocket-action'
import { logger } from '@/util/logger'

export class WebSocketMiddleware {
  private middlewares: Array<
    (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | Error>
  > = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | Error>
  ) {
    this.middlewares.push(
      callback as (
        action: ClientAction,
        clientSessionId: string,
        ws: WebSocket
      ) => Promise<void | Error>
    )
  }

  async execute(
    action: ClientAction,
    clientSessionId: string,
    ws: WebSocket
  ): Promise<boolean> {
    for (const middleware of this.middlewares) {
      const res = await middleware(action, clientSessionId, ws)
      if (res) {
        logger.error('Middleware execution halted:', res)
        sendAction(ws, {
          type: 'action-error',
          message: res.message,
        })
        return false
      }
    }
    return true
  }

  run<T extends ClientAction['type']>(
    baseAction: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => void
  ) {
    return async (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => {
      const shouldContinue = await this.execute(action, clientSessionId, ws)
      if (shouldContinue) {
        baseAction(action, clientSessionId, ws)
      }
    }
  }
}

export const protec = new WebSocketMiddleware()
protec.use(async (action, _clientSessionId, _) => {
  logger.debug(`Protecting action of type: '${action.type}'`)
})
protec.use(async (action, _clientSessionId, ws) => {
  return match(action)
    .with(
      {
        authToken: P.string,
      },
      async ({ authToken, fingerprintId }) => {
        const quotas = await db
          .select({
            userId: schema.user.id,
            quotaExceeded: sql<boolean>`COALESCE(${schema.user.quota_exceeded}, false)`,
            nextQuotaReset: sql<Date>`COALESCE(${schema.user.next_quota_reset}, now())`,
          })
          .from(schema.user)
          .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
          .where(eq(schema.session.sessionToken, authToken))

        const quota = quotas[0]
        if (!quota) {
          return new Error(`Unable to find user for given token ${authToken}!`)
        }

        const quotaManager = new AuthenticatedQuotaManager()
        if (quota.quotaExceeded) {
          if (quota.nextQuotaReset < new Date()) {
            // End date is in the past, so we should reset the quota
            await quotaManager.resetQuota(quota.userId)
          } else {
            logger.error(`Quota exceeded for user ${quota.userId}`)
            const { usage, limit } = await quotaManager.checkQuota(quota.userId)
            return new Error(`Quota exceeded!`)
          }
        }
        return
      }
    )
    .with(
      {
        fingerprintId: P.string,
      },
      async ({ fingerprintId }) => {
        // Create a new fingerprint if it doesn't exist
        await db
          .insert(schema.fingerprint)
          .values({
            id: fingerprintId,
          })
          .onConflictDoNothing()

        const quotas = await db
          .select({
            fingerprintId: schema.fingerprint.id,
            quotaExceeded: sql<boolean>`COALESCE(${schema.fingerprint.quota_exceeded}, false)`,
            nextQuotaReset: sql<Date>`COALESCE(${schema.fingerprint.next_quota_reset}, now())`,
          })
          .from(schema.fingerprint)
          .where(eq(schema.fingerprint.id, fingerprintId))

        const quota = quotas[0]
        if (!quota) {
          return new Error(
            `Unable to find fingerprint for given id ${fingerprintId}!`
          )
        }

        const quotaManager = new AnonymousQuotaManager()
        if (quota.quotaExceeded) {
          if (quota.nextQuotaReset < new Date()) {
            // End date is in the past, so we should reset the quota
            quotaManager.resetQuota(quota.fingerprintId)
          } else {
            logger.error(`Quota exceeded for fingerprint ${fingerprintId}`)
            const { usage, limit } = await quotaManager.checkQuota(
              quota.fingerprintId
            )
            return new Error(`Quota exceeded!`)
          }
        }
        return
      }
    )
    .otherwise(() => {
      return new Error(
        'No authToken or fingerprintId found, cannot check quota'
      )
    })
})
