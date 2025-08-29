import { calculateUsageAndBalance } from '@codebuff/billing'
import { trackEvent } from '@codebuff/common/analytics'
import {
  ASYNC_AGENTS_ENABLED,
  toOptionalFile,
} from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import db from '@codebuff/common/db/index'
import * as schema from '@codebuff/common/db/schema'
import { getErrorObject } from '@codebuff/common/util/error'
import { ensureEndsWithNewline } from '@codebuff/common/util/file'
import { generateCompactId } from '@codebuff/common/util/string'
import { eq } from 'drizzle-orm'

import { asyncAgentManager } from '../async-agent-manager'
import {
  cancelUserInput,
  checkLiveUserInput,
  endUserInput,
  startUserInput,
} from '../live-user-inputs'
import { mainPrompt } from '../main-prompt'
import { protec } from './middleware'
import { sendMessage } from './server'
import { assembleLocalAgentTemplates } from '../templates/agent-registry'
import { logger, withLoggerContext } from '../util/logger'

import type {
  ClientAction,
  ServerAction,
  UsageResponse,
} from '@codebuff/common/actions'
import type { ToolResultOutput } from '@codebuff/common/types/messages/content-part'
import type { ClientMessage } from '@codebuff/common/websockets/websocket-schema'
import type { WebSocket } from 'ws'

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
  authToken?: string,
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
 * Generates a usage response object for the client
 * @param fingerprintId - The fingerprint ID for the user/device
 * @param userId - user ID for authenticated users
 * @param clientSessionId - Optional session ID
 * @returns A UsageResponse object containing usage metrics and referral information
 */
export async function genUsageResponse(
  fingerprintId: string,
  userId: string,
  clientSessionId: string | undefined,
): Promise<UsageResponse> {
  const logContext = { fingerprintId, userId, sessionId: clientSessionId }
  const defaultResp = {
    type: 'usage-response' as const,
    usage: 0,
    remainingBalance: 0,
    next_quota_reset: null,
  } satisfies UsageResponse

  return withLoggerContext<UsageResponse>(logContext, async () => {
    const user = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: {
        next_quota_reset: true,
      },
    })

    if (!user) {
      return defaultResp
    }

    try {
      // Get the usage data
      const { balance: balanceDetails, usageThisCycle } =
        await calculateUsageAndBalance(userId, new Date())

      return {
        type: 'usage-response' as const,
        usage: usageThisCycle,
        remainingBalance: balanceDetails.totalRemaining,
        balanceBreakdown: balanceDetails.breakdown,
        next_quota_reset: user.next_quota_reset,
      } satisfies UsageResponse
    } catch (error) {
      logger.error(
        { error, usage: defaultResp },
        'Error generating usage response, returning default',
      )
    }

    return defaultResp
  })
}

/**
 * Handles prompt actions from the client
 * @param action - The prompt action from the client
 * @param clientSessionId - The client's session ID
 * @param ws - The WebSocket connection
 */
const onPrompt = async (
  action: ClientAction<'prompt'>,
  clientSessionId: string,
  ws: WebSocket,
) => {
  const { fingerprintId, authToken, promptId, prompt, costMode } = action

  await withLoggerContext(
    { fingerprintId, clientRequestId: promptId, costMode },
    async () => {
      const userId = await getUserIdFromAuthToken(authToken)
      if (!userId) {
        throw new Error('User not found')
      }

      if (prompt) {
        logger.info({ prompt }, `USER INPUT: ${prompt.slice(0, 100)}`)
        trackEvent(AnalyticsEvent.USER_INPUT, userId, {
          prompt,
          promptId,
        })
      }

      startUserInput(userId, promptId)

      try {
        await callMainPrompt(ws, action, {
          userId,
          promptId,
          clientSessionId,
        })
      } catch (e) {
        logger.error({ error: getErrorObject(e) }, 'Error in mainPrompt')
        let response =
          e && typeof e === 'object' && 'message' in e ? `${e.message}` : `${e}`

        sendAction(ws, {
          type: 'prompt-error',
          userInputId: promptId,
          message: response,
        })
      } finally {
        endUserInput(userId, promptId)
        const usageResponse = await genUsageResponse(
          fingerprintId,
          userId,
          undefined,
        )
        sendAction(ws, usageResponse)
      }
    },
  )
}

export const callMainPrompt = async (
  ws: WebSocket,
  action: ClientAction<'prompt'>,
  options: {
    userId: string
    promptId: string
    clientSessionId: string
  },
) => {
  const { userId, promptId, clientSessionId } = options
  const { fileContext } = action.sessionState

  // Enforce server-side state authority: reset creditsUsed to 0
  // The server controls cost tracking, clients cannot manipulate this value
  action.sessionState.mainAgentState.creditsUsed = 0

  // Assemble local agent templates from fileContext
  const { agentTemplates: localAgentTemplates, validationErrors } =
    assembleLocalAgentTemplates(fileContext)

  if (validationErrors.length > 0) {
    sendAction(ws, {
      type: 'prompt-error',
      message: `Invalid agent config: ${validationErrors.map((err) => err.message).join('\n')}`,
      userInputId: promptId,
    })
  }

  const result = await mainPrompt(ws, action, {
    userId,
    clientSessionId,
    localAgentTemplates,
    onResponseChunk: (chunk) => {
      if (checkLiveUserInput(userId, promptId, clientSessionId)) {
        sendAction(ws, {
          type: 'response-chunk',
          userInputId: promptId,
          chunk,
        })
      }
    },
  })

  const { sessionState, toolCalls, toolResults } = result

  // Send prompt data back
  sendAction(ws, {
    type: 'prompt-response',
    promptId,
    sessionState,
    toolCalls: toolCalls as any[],
    toolResults,
  })

  return result
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
  { fileContext, fingerprintId, authToken }: ClientAction<'init'>,
  clientSessionId: string,
  ws: WebSocket,
) => {
  await withLoggerContext({ fingerprintId }, async () => {
    const userId = await getUserIdFromAuthToken(authToken)

    if (!userId) {
      sendAction(ws, {
        usage: 0,
        remainingBalance: 0,
        next_quota_reset: null,
        type: 'init-response',
      })
      return
    }

    // Send combined init and usage response
    const usageResponse = await genUsageResponse(
      fingerprintId,
      userId,
      clientSessionId,
    )
    sendAction(ws, {
      ...usageResponse,
      type: 'init-response',
    })
  })
}

const onCancelUserInput = async ({
  authToken,
  promptId,
}: ClientAction<'cancel-user-input'>) => {
  const userId = await getUserIdFromAuthToken(authToken)
  if (!userId) {
    logger.error({ authToken }, 'User id not found for authToken')
    return
  }
  cancelUserInput(userId, promptId)
  if (ASYNC_AGENTS_ENABLED) {
    asyncAgentManager.cleanupUserInputAgents(promptId)
  }
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
    action: ClientAction<T>,
    clientSessionId: string,
    ws: WebSocket,
  ) => void,
) => {
  callbacksByAction[type] = (callbacksByAction[type] ?? []).concat(
    callback as (
      action: ClientAction,
      clientSessionId: string,
      ws: WebSocket,
    ) => void,
  )
  return () => {
    callbacksByAction[type] = (callbacksByAction[type] ?? []).filter(
      (cb) => cb !== callback,
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
  msg: ClientMessage & { type: 'action' },
) => {
  await withLoggerContext({ clientSessionId }, async () => {
    const callbacks = callbacksByAction[msg.data.type] ?? []
    try {
      await Promise.all(
        callbacks.map((cb) => cb(msg.data, clientSessionId, ws)),
      )
    } catch (e) {
      logger.error(
        {
          message: msg,
          error: e && typeof e === 'object' && 'message' in e ? e.message : e,
        },
        'Got error running subscribeToAction callback',
      )
    }
  })
}

// Register action handlers
subscribeToAction('prompt', protec.run(onPrompt))
subscribeToAction('init', protec.run(onInit, { silent: true }))
subscribeToAction('cancel-user-input', protec.run(onCancelUserInput))

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

/**
 * Requests a tool call execution from the client with timeout support
 * @param ws - The WebSocket connection
 * @param toolName - Name of the tool to execute
 * @param input - Arguments for the tool (can include timeout)
 * @returns Promise resolving to the tool execution result
 */
export async function requestToolCall(
  ws: WebSocket,
  userInputId: string,
  toolName: string,
  input: Record<string, any> & { timeout_seconds?: number },
): Promise<{
  output: ToolResultOutput[]
}> {
  return new Promise((resolve) => {
    const requestId = generateCompactId()
    const timeoutInSeconds =
      (input.timeout_seconds || 30) < 0
        ? undefined
        : input.timeout_seconds || 30

    // Set up timeout
    const timeoutHandle =
      timeoutInSeconds === undefined
        ? undefined
        : setTimeout(
            () => {
              unsubscribe()
              resolve({
                output: [
                  {
                    type: 'json',
                    value: {
                      errorMessage: `Tool call '${toolName}' timed out after ${timeoutInSeconds}s`,
                    },
                  },
                ],
              })
            },
            timeoutInSeconds * 1000 + 5000, // Convert to ms and add a small buffer
          )

    // Subscribe to response
    const unsubscribe = subscribeToAction('tool-call-response', (action) => {
      if (action.requestId === requestId) {
        clearTimeout(timeoutHandle)
        unsubscribe()
        resolve({
          output: action.output,
        })
      }
    })

    // Send the request
    sendAction(ws, {
      type: 'tool-call-request',
      requestId,
      userInputId,
      toolName,
      input,
      timeout:
        timeoutInSeconds === undefined ? undefined : timeoutInSeconds * 1000, // Send timeout in milliseconds
    })
  })
}
