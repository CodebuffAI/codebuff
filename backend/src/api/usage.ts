import { getOrganizationUsageResponse } from '@codebuff/billing'
import db from '@codebuff/common/db'
import * as schema from '@codebuff/common/db/schema'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { checkAuth } from '../util/check-auth'
import { logger } from '../util/logger'
import { genUsageResponse } from '../websockets/websocket-action'

const usageRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  orgId: z.string().optional(),
})

async function getUserIdFromAuthToken(
  token: string,
): Promise<string | undefined> {
  const user = await db
    .select({ userId: schema.user.id })
    .from(schema.user)
    .innerJoin(schema.session, eq(schema.user.id, schema.session.userId))
    .where(eq(schema.session.sessionToken, token))
    .then((users) => users[0]?.userId)
  return user
}

export default async function usageHandler(
  req: Request,
  ok: (body: any, init?: ResponseInit) => Response,
): Promise<Response> {
  try {
    const body = await req.json()
    const { fingerprintId, authToken, orgId } = usageRequestSchema.parse(body)
    const clientSessionId = `api-${fingerprintId}-${Date.now()}`

    const authResult = await checkAuth({
      fingerprintId,
      authToken,
      clientSessionId,
    })
    if (authResult) {
      const message =
        authResult.type === 'action-error'
          ? authResult.message
          : 'Authentication failed'
      return new Response(JSON.stringify({ message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const userId = authToken
      ? await getUserIdFromAuthToken(authToken)
      : undefined
    if (!userId) {
      return new Response(
        JSON.stringify({ message: 'Authentication failed' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    if (orgId) {
      try {
        const orgUsageResponse = await getOrganizationUsageResponse(
          orgId,
          userId,
        )
        return ok(orgUsageResponse)
      } catch (error) {
        logger.error(
          { error, orgId, userId },
          'Error fetching organization usage',
        )
        logger.info(
          { orgId, userId },
          'Falling back to personal usage due to organization error',
        )
      }
    }

    const usageResponse = await genUsageResponse(
      fingerprintId,
      userId,
      clientSessionId,
    )
    return ok(usageResponse)
  } catch (error) {
    logger.error({ error }, 'Error handling /api/usage request')
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({
          message: 'Invalid request body',
          issues: error.errors,
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('Something broke!', { status: 500 })
  }
}
