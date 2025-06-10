import { utils } from '@codebuff/internal'
import { ServerAction } from 'common/actions'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'
import { Request, Response, NextFunction } from 'express'

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
  // Use shared auth check functionality
  const authResult = await utils.checkAuthToken({
    fingerprintId,
    authToken,
  })

  if (!authResult.success) {
    const errorMessage = authResult.error?.message || 'Authentication failed'
    logger.error(
      { clientSessionId, error: errorMessage },
      errorMessage
    )
    return {
      type: 'action-error',
      message: errorMessage,
    }
  }

  if (authResult.user) {
    // Log successful authentication if we have a user
    logger.debug(
      { clientSessionId, userId: authResult.user.id },
      'Authentication successful'
    )
  }

  return
}

// Express middleware for checking admin access
export const checkAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Extract auth token from Authorization header
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ error: 'Missing or invalid Authorization header' })
  }
  const authToken = authHeader.substring(7) // Remove 'Bearer ' prefix

  // Generate a client session ID for this request
  const clientSessionId = `admin-relabel-${Date.now()}`

  // Check authentication
  const authResult = await checkAuth({
    authToken,
    clientSessionId,
  })

  if (authResult) {
    // checkAuth returns an error action if auth fails
    const errorMessage =
      authResult.type === 'action-error'
        ? authResult.message
        : 'Authentication failed'
    return res.status(401).json({ error: errorMessage })
  }

  // Get the user ID associated with this session token
  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
    })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => users[0])

  if (!user) {
    return res.status(401).json({ error: 'Invalid session' })
  }

  // Check if user has admin access using shared utility
  const adminUser = await utils.checkUserIsCodebuffAdmin(user.id)
  if (!adminUser) {
    logger.warn(
      { userId: user.id, email: user.email, clientSessionId },
      'Unauthorized access attempt to admin endpoint'
    )
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Store user info in request for handlers to use if needed
  // req.user = adminUser // TODO: ensure type check passes

  // Auth passed and user is admin, proceed to next middleware
  next()
  return
}
