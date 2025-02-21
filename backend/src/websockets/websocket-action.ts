import { WebSocket } from 'ws'
import { eq, and, gt } from 'drizzle-orm'
import _, { isEqual } from 'lodash'
import { match, P } from 'ts-pattern'

import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction, UsageResponse } from 'common/actions'
import { sendMessage } from './server'
import { env } from '../env.mjs'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { TOOL_RESULT_MARKER } from 'common/constants'
import { protec } from './middleware'
import { getQuotaManager } from 'common/src/billing/quota-manager'
import { getNextQuotaReset } from 'common/src/util/dates'
import { logger, withLoggerContext } from '@/util/logger'
import { generateCommitMessage } from '@/generate-commit-message'
import { hasMaxedReferrals } from 'common/util/server/referral'

export const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

export const getUserIdFromAuthToken = async (
  authToken?: string
): Promise<string | undefined> => {
  if (!authToken) return undefined

  const userId = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => {
      if (users.length === 1) {
        return users[0].userId
      }
      return undefined
    })

  return userId
}

async function calculateUsage(
  fingerprintId: string,
  userId: string | undefined,
  sessionId: string | undefined
) {
  const quotaManager = getQuotaManager(
    userId ? 'authenticated' : 'anonymous',
    userId ?? fingerprintId
  )
  const {
    creditsUsed,
    quota,
    endDate,
    subscription_active,
    session_credits_used,
  } = await quotaManager.checkQuota(sessionId)

  // Case 1: end date is in the past, so just reset the quota
  if (endDate < new Date()) {
    const nextQuotaReset = getNextQuotaReset(endDate)
    await quotaManager.setNextQuota(false, nextQuotaReset)

    // pull their newly updated info
    const newQuota = await quotaManager.checkQuota(sessionId)
    return {
      usage: newQuota.creditsUsed,
      limit: newQuota.quota,
      subscription_active: newQuota.subscription_active,
      next_quota_reset: nextQuotaReset,
      session_credits_used: newQuota.session_credits_used ?? 0,
    }
  }

  // Case 2: end date hasn't been reached yet
  // if a non-subscribed user has exceeded their quota, set their quota exceeded flag
  if (creditsUsed >= quota && !subscription_active) {
    const nextQuotaReset = getNextQuotaReset(endDate)
    await quotaManager.setNextQuota(true, nextQuotaReset)
  }

  return {
    usage: creditsUsed,
    limit: quota,
    subscription_active,
    next_quota_reset: endDate,
    session_credits_used: session_credits_used ?? 0,
  }
}

export async function genUsageResponse(
  sessionId: string,
  fingerprintId: string,
  userId?: string
): Promise<UsageResponse> {
  const params = await withLoggerContext(
    { fingerprintId, userId },
    async () => {
      const {
        usage,
        limit,
        subscription_active,
        next_quota_reset,
        session_credits_used,
      } = await calculateUsage(fingerprintId, userId, sessionId)
      logger.info('Sending usage info')

      let referralLink: string | undefined = undefined
      if (userId) {
        logger.info(`Checking referral status for user ${userId}`)
        const referralStatus = await hasMaxedReferrals(userId)
        if (referralStatus.reason === undefined) {
          referralLink = referralStatus.referralLink
          logger.info(
            `Generated referral link for user ${userId}. Referral count: ${referralStatus.details.referralCount}`
          )
        } else {
          logger.info(
            `Not generating referral link for user ${userId}: ${referralStatus.reason}. Details: ${JSON.stringify(referralStatus.details)}`
          )
        }
      } else {
        logger.info('No userId provided, skipping referral link generation')
      }
      return {
        usage,
        limit,
        referralLink,
        subscription_active,
        next_quota_reset,
        session_credits_used,
      }
    }
  )

  return {
    type: 'usage-response',
    ...params,
  }
}

const onUserInput = async (
  action: Extract<ClientAction, { type: 'user-input' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  const {
    fingerprintId,
    authToken,
    userInputId,
    messages,
    fileContext,
    changesAlreadyApplied,
    costMode = 'normal',
  } = action

  await withLoggerContext(
    { fingerprintId, authToken, clientRequestId: userInputId },
    async () => {
      const lastMessage = messages[messages.length - 1]
      if (
        typeof lastMessage.content === 'string' &&
        !lastMessage.content.includes(TOOL_RESULT_MARKER)
      ) {
        logger.info(`USER INPUT: ${lastMessage.content}`)
      }

      const userId = await getUserIdFromAuthToken(authToken)
      try {
        const {
          toolCall,
          response,
          changes,
          addedFileVersions,
          resetFileVersions,
        } = await mainPrompt(
          ws,
          messages,
          fileContext,
          clientSessionId,
          fingerprintId,
          userInputId,
          (chunk) =>
            sendAction(ws, {
              type: 'response-chunk',
              userInputId,
              chunk,
            }),
          userId,
          changesAlreadyApplied,
          action.costMode
        )

        logger.debug(
          { response, changes, changesAlreadyApplied, toolCall },
          'response-complete'
        )

        if (toolCall) {
          sendAction(ws, {
            type: 'tool-call',
            userInputId,
            response,
            data: toolCall,
            changes,
            changesAlreadyApplied,
            addedFileVersions,
            resetFileVersions,
          })
        } else {
          const {
            usage,
            limit,
            referralLink,
            subscription_active,
            next_quota_reset,
            session_credits_used,
          } = await genUsageResponse(clientSessionId, fingerprintId, userId)
          sendAction(ws, {
            type: 'response-complete',
            userInputId,
            response,
            changes,
            changesAlreadyApplied,
            usage,
            limit,
            subscription_active,
            referralLink,
            addedFileVersions,
            resetFileVersions,
            next_quota_reset,
            session_credits_used,
          })
        }
      } catch (e) {
        logger.error(e, 'Error in mainPrompt')
        const response =
          e && typeof e === 'object' && 'message' in e ? `\n\n${e.message}` : ''
        sendAction(ws, {
          type: 'response-chunk',
          userInputId,
          chunk: response,
        })
        // await sleep(1000) // sleeping makes this sendAction not fire. unsure why but remove for now
        sendAction(ws, {
          type: 'response-complete',
          userInputId,
          response,
          changes: [],
          changesAlreadyApplied,
          addedFileVersions: [],
          resetFileVersions: false,
        })
      }
    }
  )
}

const onInit = async (
  {
    fileContext,
    fingerprintId,
    authToken,
  }: Extract<ClientAction, { type: 'init' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext({ fingerprintId, authToken }, async () => {
    // Create a new session for fingerprint if it doesn't exist
    await db
      .insert(schema.fingerprint)
      .values({
        id: fingerprintId,
      })
      .onConflictDoNothing()

    const userId = await getUserIdFromAuthToken(authToken)

    // DISABLED FOR NOW
    // warm context cache
    // const startTime = Date.now()
    // const system = getSearchSystemPrompt(fileContext)
    // try {
    //   await promptClaude(
    //     [
    //       {
    //         role: 'user',
    //         content: 'please respond with just a single word "codebuff"',
    //       },
    //     ],
    //     {
    //       model: claudeModels.haiku,
    //       system,
    //       clientSessionId,
    //       fingerprintId,
    //       userId,
    //       userInputId: 'init-cache',
    //       maxTokens: 1,
    //     }
    //   )
    //   logger.info(`Warming context cache done in ${Date.now() - startTime}ms`)
    // } catch (e) {
    //   logger.error(e, 'Error in init')
    // }

    const {
      usage,
      limit,
      subscription_active,
      next_quota_reset,
      session_credits_used,
    } = await calculateUsage(fingerprintId, userId, clientSessionId)
    sendAction(ws, {
      type: 'init-response',
      usage,
      limit,
      subscription_active,
      next_quota_reset,
      session_credits_used,
    })
  })
}

export const onUsageRequest = async (
  { fingerprintId, authToken }: Extract<ClientAction, { type: 'usage' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  const userId = await getUserIdFromAuthToken(authToken)
  const action = await genUsageResponse(clientSessionId, fingerprintId, userId)
  sendAction(ws, action)
}

const onGenerateCommitMessage = async (
  {
    fingerprintId,
    authToken,
    stagedChanges,
  }: Extract<ClientAction, { type: 'generate-commit-message' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext({ fingerprintId, authToken }, async () => {
    const userId = await getUserIdFromAuthToken(authToken)
    try {
      const commitMessage = await generateCommitMessage(
        stagedChanges,
        clientSessionId,
        fingerprintId,
        userId
      )
      logger.info(`Generated commit message: ${commitMessage}`)
      sendAction(ws, {
        type: 'commit-message-response',
        commitMessage,
      })
    } catch (e) {
      logger.error(e, 'Error generating commit message')
      sendAction(ws, {
        type: 'commit-message-response',
        commitMessage: 'Error generating commit message',
      })
    }
  })
}

const callbacksByAction = {} as Record<
  ClientAction['type'],
  ((action: ClientAction, clientSessionId: string, ws: WebSocket) => void)[]
>

export const subscribeToAction = <T extends ClientAction['type']>(
  type: T,
  callback: (
    action: Extract<ClientAction, { type: T }>,
    clientSessionId: string,
    ws: WebSocket
  ) => void
) => {
  callbacksByAction[type] = (callbacksByAction[type] ?? []).concat(
    callback as (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket
    ) => void
  )
  return () => {
    callbacksByAction[type] = (callbacksByAction[type] ?? []).filter(
      (cb) => cb !== callback
    )
  }
}

export const onWebsocketAction = async (
  ws: WebSocket,
  clientSessionId: string,
  msg: ClientMessage & { type: 'action' }
) => {
  await withLoggerContext({ clientSessionId }, async () => {
    const callbacks = callbacksByAction[msg.data.type] ?? []
    try {
      await Promise.all(
        callbacks.map((cb) => cb(msg.data, clientSessionId, ws))
      )
    } catch (e) {
      logger.error(
        {
          message: msg,
          error: e && typeof e === 'object' && 'message' in e ? e.message : e,
        },
        'Got error running subscribeToAction callback'
      )
    }
  })
}

subscribeToAction('user-input', protec.run(onUserInput))
subscribeToAction('init', protec.run(onInit, { silent: true }))

subscribeToAction('usage', onUsageRequest)
subscribeToAction('generate-commit-message', protec.run(onGenerateCommitMessage))

export async function requestFiles(ws: WebSocket, filePaths: string[]) {
  return new Promise<Record<string, string | null>>((resolve) => {
    const unsubscribe = subscribeToAction('read-files-response', (action) => {
      const receivedFilePaths = Object.keys(action.files)
      if (isEqual(receivedFilePaths, filePaths)) {
        unsubscribe()
        resolve(action.files)
      }
    })
    sendAction(ws, {
      type: 'read-files',
      filePaths,
    })
  })
}

export async function requestFile(ws: WebSocket, filePath: string) {
  const files = await requestFiles(ws, [filePath])
  return files[filePath]
}
