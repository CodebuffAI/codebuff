import { eq } from 'drizzle-orm'
import { Request, Response, NextFunction } from 'express'

import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { ServerAction } from 'common/actions'
import { logger } from '@/util/logger'
import { triggerMonthlyResetAndGrant } from '@codebuff/billing'

import { checkAuthToken, checkUserIsCodebuffAdmin } from '@codebuff/internal/utils/auth'

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
  if (!authToken) {
    logger.error(
      { clientSessionId },
      'Authentication failed: No auth token provided'
    )
    return {
      type: 'action-error',
      message: 'Authentication failed',
    }
  }

  const authResult = await checkAuthToken(authToken)

  if (!authResult.success) {
    logger.error(
      { clientSessionId, error: authResult.error },
      authResult.error || 'Authentication failed'
    )
    return {
      type: 'action-error',
      message: authResult.error || 'Authentication failed',
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
  const adminUser = await checkUserIsCodebuffAdmin(user.id)
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
