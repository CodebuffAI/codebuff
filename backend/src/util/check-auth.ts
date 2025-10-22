import { utils } from '@codebuff/internal'

import { extractAuthTokenFromHeader } from './auth-helpers'
import { getUserInfoFromApiKey } from '../websockets/auth'

import type { ServerAction } from '@codebuff/common/actions'
import type { GetUserInfoFromApiKeyFn } from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { Request, Response, NextFunction } from 'express'

export const checkAuth = async (
  params: {
    authToken?: string
    clientSessionId: string
    getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
    logger: Logger
  } & ParamsExcluding<GetUserInfoFromApiKeyFn, 'apiKey' | 'fields'>,
): Promise<void | ServerAction> => {
  const { authToken, clientSessionId, getUserInfoFromApiKey, logger } = params

  // Use shared auth check functionality
  const authResult = authToken
    ? await getUserInfoFromApiKey({
        ...params,
        apiKey: authToken,
        fields: ['id'],
      })
    : null

  if (!authResult) {
    const errorMessage = 'Authentication failed'
    logger.error({ clientSessionId, error: errorMessage }, errorMessage)
    return {
      type: 'action-error',
      message: errorMessage,
    }
  }

  // if (authResult.user) {
  //   // Log successful authentication if we have a user
  //   logger.debug(
  //     { clientSessionId, userId: authResult.user.id },
  //     'Authentication successful'
  //   )
  // }

  return
}

// Express middleware for checking admin access
export const checkAdmin =
  (logger: Logger) =>
  async (req: Request, res: Response, next: NextFunction) => {
    // Extract auth token from x-codebuff-api-key header
    const authToken = extractAuthTokenFromHeader(req)
    if (!authToken) {
      return res
        .status(401)
        .json({ error: 'Missing x-codebuff-api-key header' })
    }

    // Generate a client session ID for this request
    const clientSessionId = `admin-relabel-${Date.now()}`

    // Check authentication
    const user = await getUserInfoFromApiKey({
      apiKey: authToken,
      fields: ['id', 'email'],
      logger,
    })

    if (!user) {
      return res.status(401).json({ error: 'Invalid session' })
    }

    // Check if user has admin access using shared utility
    const adminUser = await utils.checkUserIsCodebuffAdmin(user.id)
    if (!adminUser) {
      logger.warn(
        { userId: user.id, email: user.email, clientSessionId },
        'Unauthorized access attempt to admin endpoint',
      )
      return res.status(403).json({ error: 'Forbidden' })
    }

    // Store user info in request for handlers to use if needed
    // req.user = adminUser // TODO: ensure type check passes

    // Auth passed and user is admin, proceed to next middleware
    next()
    return
  }
