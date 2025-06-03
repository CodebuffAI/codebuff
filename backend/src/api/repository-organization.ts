import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq } from 'drizzle-orm'

import { checkAuth } from '../util/check-auth'
import { findOrganizationForRepository } from '@codebuff/billing'
import { logger } from '@/util/logger'

const repositoryOrganizationRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  repositoryUrl: z.string(),
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

async function repositoryOrganizationHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    const { fingerprintId, authToken, repositoryUrl } =
      repositoryOrganizationRequestSchema.parse(req.body)
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

    if (!repositoryUrl) {
      return res.status(400).json({ message: 'Repository URL is required' })
    }

    // Find organization for this repository
    const orgLookup = await findOrganizationForRepository(userId, repositoryUrl)

    if (orgLookup.found) {
      return res.status(200).json({
        organization: {
          id: orgLookup.organizationId,
          name: orgLookup.organizationName,
        },
      })
    }

    return res.status(200).json({ organization: null })
  } catch (error) {
    logger.error(
      { error },
      'Error handling /api/repository-organization request'
    )
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ message: 'Invalid request body', issues: error.errors })
    }
    next(error)
    return
  }
}

export default repositoryOrganizationHandler
