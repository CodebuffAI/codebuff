import { WebSocket } from 'ws'
import { ClientAction, ServerAction } from 'common/actions'
import { match, P } from 'ts-pattern'
import db from 'common/db'
import * as schema from 'common/db/schema'
import {
  AnonymousQuotaManager,
  AuthenticatedQuotaManager,
} from 'common/billing/quota-manager'
import { sql, eq } from 'drizzle-orm'
import { genUsageResponse, sendAction } from './websocket-action'
import { logger } from '@/util/logger'
import { env } from '@/env.mjs'
import { getNextQuotaReset } from 'common/util/dates'

export class WebSocketMiddleware {
  private middlewares: Array<
    (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | ServerAction>
  > = []

  use<T extends ClientAction['type']>(
    callback: (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => Promise<void | ServerAction>
  ) {
    this.middlewares.push(
      callback as (
        action: ClientAction,
        clientSessionId: string,
        ws: WebSocket
      ) => Promise<void | ServerAction>
    )
  }

  async execute(
    action: ClientAction,
    clientSessionId: string,
    ws: WebSocket,
    options: { silent?: boolean } = {}
  ): Promise<boolean> {
    for (const middleware of this.middlewares) {
      const actionOrContinue = await middleware(action, clientSessionId, ws)
      if (actionOrContinue) {
        logger.warn(
          {
            action,
            middlewareResp: actionOrContinue,
            clientSessionId,
            silent: !!options.silent,
          },
          'Middleware execution halted.'
        )
        if (!options.silent) {
          sendAction(ws, actionOrContinue)
        }
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
    ) => void,
    options: { silent?: boolean } = {}
  ) {
    return async (
      action: Extract<ClientAction, { type: T }>,
      clientSessionId: string,
      ws: WebSocket
    ) => {
      const shouldContinue = await this.execute(
        action,
        clientSessionId,
        ws,
        options
      )
      if (shouldContinue) {
        baseAction(action, clientSessionId, ws)
      }
    }
  }
}

export const protec = new WebSocketMiddleware()

protec.use(async (action, clientSessionId, ws) =>
  match(action)
    .with(
      { authToken: P.string, fingerprintId: P.string },
      async ({ authToken, fingerprintId }) => {
        const quota = await db
          .select({
            userId: schema.user.id,
            quotaExceeded: sql<boolean>`COALESCE(${schema.user.quota_exceeded}, false)`,
            nextQuotaReset: sql<string>`COALESCE(${schema.user.next_quota_reset}, now())`,
          })
          .from(schema.user)
          .leftJoin(schema.session, eq(schema.user.id, schema.session.userId))
          .where(eq(schema.session.sessionToken, authToken))
          .limit(1)
          .then((rows) => rows[0])

        if (!quota) {
          return {
            type: 'action-error' as const,
            message: `Unable to find user for given token ${authToken}! Please reach out to ${env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`,
          }
        }

        const currentQuotaReset = new Date(quota.nextQuotaReset)
        if (currentQuotaReset <= new Date()) {
          const nextQuotaReset = getNextQuotaReset(currentQuotaReset)
          logger.info(
            {
              userId: quota.userId,
              fingerprintId,
              currentQuotaReset,
              nextQuotaReset,
            },
            `Setting next quota reset for user ${quota.userId}`
          )
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
            ),
          ])
          return
        } else if (quota.quotaExceeded) {
          logger.warn(`Quota exceeded for user ${quota.userId}`)
          return genUsageResponse(clientSessionId, fingerprintId, quota.userId)
        }
        return
      }
    )
    .otherwise(() => ({
      type: 'action-error' as const,
      message: `Access denied. Missing auth token, please enter "login" to continue.`,
    }))
)
