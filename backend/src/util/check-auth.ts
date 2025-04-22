import { eq } from 'drizzle-orm'
import { Request, Response, NextFunction } from 'express'

import db from 'common/db'
import * as schema from 'common/db/schema'
import { ServerAction } from 'common/actions'
import { logger } from '@/util/logger'
import { triggerMonthlyResetAndGrant } from 'common/src/billing/grant-credits'

// List of admin user emails
const ADMIN_USER_EMAILS = [
  'venkateshrameshkumar+1@gmail.com',
  'brandonchenjiacheng@gmail.com',
  'jahooma@gmail.com',
  'charleslien97@gmail.com',
]

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

  // Check and trigger monthly reset if needed
  await triggerMonthlyResetAndGrant(user.id)

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

  // Get the user email associated with this session token
  const user = await db
    .select({
      id: schema.user.id,
      email: schema.user.email,
    })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, authToken))
    .then((users) => users[0])

  // Check if user has admin access
  if (!user?.email || !ADMIN_USER_EMAILS.includes(user.email)) {
    logger.warn(
      { userId: user?.id, email: user?.email, clientSessionId },
      'Unauthorized access attempt to admin endpoint'
    )
    return res.status(403).json({ error: 'Forbidden' })
  }

  // Store user info in request for handlers to use if needed
  // req.user = user // TODO: ensure type check passes

  // Auth passed and user is admin, proceed to next middleware
  next()
  return
}
