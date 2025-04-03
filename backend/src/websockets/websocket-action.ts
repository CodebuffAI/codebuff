import { WebSocket } from 'ws'
import { eq } from 'drizzle-orm'
import _, { isEqual } from 'lodash'

import { ClientMessage } from 'common/websockets/websocket-schema'
import { mainPrompt } from '../main-prompt'
import { ClientAction, ServerAction, UsageResponse } from 'common/actions'
import { sendMessage } from './server'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { protec } from './middleware'
import { getQuotaManager } from 'common/src/billing/quota-manager'
import { getNextQuotaReset } from 'common/src/util/dates'
import { ensureEndsWithNewline } from 'common/src/util/file'
import { logger, withLoggerContext } from '@/util/logger'
import { generateCompactId } from 'common/util/string'
import { renderToolResults } from '@/util/parse-tool-call-xml'
import { buildArray } from 'common/util/array'
import { toOptionalFile } from 'common/constants'

/**
 * Sends an action to the client via WebSocket
 * @param ws - The WebSocket connection to send the action to
 * @param action - The server action to send
 */
export const sendAction = (ws: WebSocket, action: ServerAction) => {
  sendMessage(ws, {
    type: 'action',
    data: action,
  })
}

/**
 * Retrieves a user ID from an authentication token
 * @param authToken - The authentication token to validate
 * @returns The user ID if found, undefined otherwise
 */
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

/**
 * Calculates usage metrics for a user or anonymous session
 * @param fingerprintId - The fingerprint ID for anonymous users
 * @param userId - The user ID for authenticated users
 * @param sessionId - The current session ID
 * @returns Object containing usage metrics including credits used, quota limits, and subscription status
 */
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

/**
 * Generates a usage response object for the client
 * @param fingerprintId - The fingerprint ID for the user/device
 * @param userId - Optional user ID for authenticated users
 * @param clientSessionId - Optional session ID
 * @param requestedByUser - Whether the request was made by the user
 * @returns A UsageResponse object containing usage metrics and referral information
 */
export async function genUsageResponse(
  fingerprintId: string,
  userId: string | undefined,
  clientSessionId: string | undefined,
  requestedByUser: boolean = false
): Promise<UsageResponse> {
  const params = await calculateUsage(fingerprintId, userId, clientSessionId)
  logger.info(
    {
      fingerprintId,
      userId,
      sessionId: clientSessionId,
      ...params,
    },
    'Generating usage info'
  )

  return {
    type: 'usage-response',
    ...params,
  }
}

/**
 * Handles prompt actions from the client
 * @param action - The prompt action from the client
 * @param clientSessionId - The client's session ID
 * @param ws - The WebSocket connection
 */
const onPrompt = async (
  action: Extract<ClientAction, { type: 'prompt' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  const { fingerprintId, authToken, promptId, prompt, toolResults } = action

  await withLoggerContext(
    { fingerprintId, clientRequestId: promptId },
    async () => {
      if (prompt) logger.info(`USER INPUT: ${prompt}`)

      const userId = await getUserIdFromAuthToken(authToken)
      if (!userId) {
        throw new Error('User not found')
      }
      try {
        const { agentState, toolCalls, toolResults } = await mainPrompt(
          ws,
          action,
          userId,
          clientSessionId,
          (chunk) =>
            sendAction(ws, {
              type: 'response-chunk',
              userInputId: promptId,
              chunk,
            })
        )

        // Send prompt data back
        sendAction(ws, {
          type: 'prompt-response',
          promptId,
          agentState,
          toolCalls,
          toolResults,
        })
      } catch (e) {
        logger.error(e, 'Error in mainPrompt')
        let response =
          e && typeof e === 'object' && 'message' in e ? `\n\n${e.message}` : ''
        response += '\n\n<end_turn></end_turn>'

        const newMessages = buildArray(
          ...action.agentState.messageHistory,
          prompt && {
            role: 'user' as const,
            content: prompt,
          },
          toolResults.length > 0 && {
            role: 'user' as const,
            content: renderToolResults(toolResults),
          },
          {
            role: 'assistant' as const,
            content: response,
          }
        )

        const endTurnToolCall = {
          name: 'end_turn' as const,
          parameters: {},
          id: generateCompactId(),
        }

        sendAction(ws, {
          type: 'response-chunk',
          userInputId: promptId,
          chunk: response,
        })
        setTimeout(() => {
          sendAction(ws, {
            type: 'prompt-response',
            promptId,
            // Send back original agentState.
            agentState: {
              ...action.agentState,
              messageHistory: newMessages,
            },
            toolCalls: [endTurnToolCall],
            toolResults: [],
          })
        }, 100)
      } finally {
        const usageResponse = await genUsageResponse(
          fingerprintId,
          userId,
          undefined,
          false
        )
        sendAction(ws, usageResponse)
      }
    }
  )
}

/**
 * Handles initialization actions from the client
 * @param fileContext - The file context information
 * @param fingerprintId - The fingerprint ID for the user/device
 * @param authToken - The authentication token
 * @param clientSessionId - The client's session ID
 * @param ws - The WebSocket connection
 */
const onInit = async (
  {
    fileContext,
    fingerprintId,
    authToken,
  }: Extract<ClientAction, { type: 'init' }>,
  clientSessionId: string,
  ws: WebSocket
) => {
  await withLoggerContext({ fingerprintId }, async () => {
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

    // Send combined init and usage response
    const { type, ...params } = await genUsageResponse(
      fingerprintId,
      userId,
      clientSessionId,
      false
    )
    sendAction(ws, {
      type: 'init-response',
      ...params,
    })
  })
}

/**
 * Storage for action callbacks organized by action type
 */
const callbacksByAction = {} as Record<
  ClientAction['type'],
  ((action: ClientAction, clientSessionId: string, ws: WebSocket) => void)[]
>

/**
 * Subscribes a callback function to a specific action type
 * @param type - The action type to subscribe to
 * @param callback - The callback function to execute when the action is received
 * @returns A function to unsubscribe the callback
 */
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

/**
 * Handles WebSocket action messages from clients
 * @param ws - The WebSocket connection
 * @param clientSessionId - The client's session ID
 * @param msg - The action message from the client
 */
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

// Register action handlers
subscribeToAction('prompt', protec.run(onPrompt))
subscribeToAction('init', protec.run(onInit, { silent: true }))

/**
 * Requests multiple files from the client
 * @param ws - The WebSocket connection
 * @param filePaths - Array of file paths to request
 * @returns Promise resolving to an object mapping file paths to their contents
 */
export async function requestFiles(ws: WebSocket, filePaths: string[]) {
  return new Promise<Record<string, string | null>>((resolve) => {
    const requestId = generateCompactId()
    const unsubscribe = subscribeToAction('read-files-response', (action) => {
      for (const [filename, contents] of Object.entries(action.files)) {
        action.files[filename] = ensureEndsWithNewline(contents)
      }
      if (action.requestId === requestId) {
        unsubscribe()
        resolve(action.files)
      }
    })
    sendAction(ws, {
      type: 'read-files',
      filePaths,
      requestId,
    })
  })
}

/**
 * Requests a single file from the client
 * @param ws - The WebSocket connection
 * @param filePath - The path of the file to request
 * @returns Promise resolving to the file contents or null if not found
 */
export async function requestFile(ws: WebSocket, filePath: string) {
  const files = await requestFiles(ws, [filePath])
  return files[filePath] ?? null
}

export async function requestOptionalFile(ws: WebSocket, filePath: string) {
  const file = await requestFile(ws, filePath)
  return toOptionalFile(file)
}
