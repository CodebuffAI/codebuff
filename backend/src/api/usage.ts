import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'

import { checkAuth } from '../util/check-auth'
import { genUsageResponse } from '../websockets/websocket-action'
import { logger } from '@/util/logger'
import { calculateOrganizationUsageAndBalance, syncOrganizationBillingCycle } from '@codebuff/billing'

const usageRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  organizationId: z.string().optional(),
})

async function getUserIdFromAuthToken(
  token: string
): Promise<string | undefined> {
  const user = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, token))
    .then((users) => users[0]?.userId)
  return user
}

async function genOrganizationUsageResponse(
  organizationId: string,
  userId: string
): Promise<any> {
  // Check if user is a member of this organization
  const membership = await db
    .select({ role: schema.orgMember.role })
    .from(schema.orgMember)
    .where(
      and(
        eq(schema.orgMember.org_id, organizationId),
        eq(schema.orgMember.user_id, userId)
      )
    )
    .limit(1)

  if (membership.length === 0) {
    throw new Error('User is not a member of this organization')
  }

  // Sync organization billing cycle with Stripe and get current cycle start
  const startOfCurrentCycle = await syncOrganizationBillingCycle(organizationId)
  
  let currentBalance = 0
  let usageThisCycle = 0
  
  try {
    const now = new Date()
    const { balance, usageThisCycle: usage } = await calculateOrganizationUsageAndBalance(
      organizationId,
      startOfCurrentCycle,
      now
    )
    currentBalance = balance.netBalance
    usageThisCycle = usage
  } catch (error) {
    // If no credits exist yet, that's fine
    logger.debug('No organization credits found:', error)
  }

  return {
    type: 'usage-response' as const,
    usage: usageThisCycle,
    remainingBalance: currentBalance,
    balanceBreakdown: {},
    next_quota_reset: null,
  }
}

async function usageHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    const { fingerprintId, authToken, organizationId } = usageRequestSchema.parse(req.body)
    const clientSessionId = `api-${fingerprintId}-${Date.now()}`

    const authResult = await checkAuth({
      fingerprintId,
      authToken,
      clientSessionId,
    })
    if (authResult) {
      const errorMessage =
        authResult.type === 'action-error'
          ? authResult.message
          : 'Authentication failed'
      return res.status(401).json({ message: errorMessage })
    }

    const userId = authToken
      ? await getUserIdFromAuthToken(authToken)
      : undefined

    if (!userId) {
      return res.status(401).json({ message: 'Authentication failed' })
    }

    let usageResponse

    if (organizationId) {
      // Fetch organization usage
      try {
        usageResponse = await genOrganizationUsageResponse(organizationId, userId)
      } catch (error) {
        logger.error({ error, organizationId, userId }, 'Error generating organization usage response')
        return res.status(403).json({ message: error instanceof Error ? error.message : 'Access denied' })
      }
    } else {
      // Fetch personal usage (existing behavior)
      usageResponse = await genUsageResponse(
        fingerprintId,
        userId,
        clientSessionId
      )
    }

    return res.status(200).json(usageResponse)
  } catch (error) {
    logger.error({ error }, 'Error handling /api/usage request')
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: 'Invalid request body', issues: error.errors })
    }
    next(error)
    return
  }
}

export default usageHandler
