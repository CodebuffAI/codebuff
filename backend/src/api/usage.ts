import { z } from 'zod'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'

import { checkAuth } from '../util/check-auth'
import { genUsageResponse } from '../websockets/websocket-action'
import { getOrganizationUsageResponse } from '@codebuff/billing'
import { logger } from '../util/logger'

const usageRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  orgId: z.string().optional(),
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

async function usageHandler(body: any): Promise<any> {
  let fingerprintId: string, authToken: string | undefined, orgId: string | undefined
  
  try {
    ({ fingerprintId, authToken, orgId } = usageRequestSchema.parse(body))
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ error: error.errors }, 'Invalid request body for /api/usage')
      throw new Error('Invalid request body')
    }
    throw error
  }
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
    throw new Error(errorMessage)
  }

  const userId = authToken
    ? await getUserIdFromAuthToken(authToken)
    : undefined

  if (!userId) {
    throw new Error('Authentication failed')
  }

  // If orgId is provided, return organization usage data
  if (orgId) {
    try {
      const orgUsageResponse = await getOrganizationUsageResponse(orgId, userId)
      return orgUsageResponse
    } catch (error) {
      logger.error({ error, orgId, userId }, 'Error fetching organization usage')
      // If organization usage fails, fall back to personal usage
      logger.info({ orgId, userId }, 'Falling back to personal usage due to organization error')
    }
  }

  // Return personal usage data (default behavior)
  const usageResponse = await genUsageResponse(
    fingerprintId,
    userId,
    clientSessionId
  )

  return usageResponse
}

export default usageHandler
