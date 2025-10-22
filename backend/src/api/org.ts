import { findOrganizationForRepository } from '@codebuff/billing'
import { INVALID_AUTH_TOKEN_MESSAGE } from '@codebuff/common/old-constants'
import { z } from 'zod/v4'

import { extractAuthTokenFromHeader } from '../util/auth-helpers'
import { logger } from '../util/logger'
import { getUserInfoFromApiKey } from '../websockets/auth'

import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'

const isRepoCoveredRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  remoteUrl: z.string(),
})

async function isRepoCoveredHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction,
): Promise<void | ExpressResponse> {
  try {
    const { owner, repo, remoteUrl } = isRepoCoveredRequestSchema.parse(
      req.body,
    )

    // Get user ID from x-codebuff-api-key header
    const authToken = extractAuthTokenFromHeader(req)
    if (!authToken) {
      return res
        .status(401)
        .json({ error: 'Missing x-codebuff-api-key header' })
    }
    const userId = (
      await getUserInfoFromApiKey({ apiKey: authToken, fields: ['id'], logger })
    )?.id

    if (!userId) {
      return res.status(401).json({ error: INVALID_AUTH_TOKEN_MESSAGE })
    }

    // Check if repository is covered by an organization
    const orgLookup = await findOrganizationForRepository({
      userId,
      repositoryUrl: remoteUrl,
      logger,
    })

    return res.status(200).json({
      isCovered: orgLookup.found,
      organizationName: orgLookup.organizationName,
      organizationId: orgLookup.organizationId, // Keep organizationId for now, might be used elsewhere
      organizationSlug: orgLookup.organizationSlug, // Add organizationSlug
    })
  } catch (error) {
    logger.error({ error }, 'Error handling /api/orgs/is-repo-covered request')
    if (error instanceof z.ZodError) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', issues: error.issues })
    }
    next(error)
    return
  }
}

export { isRepoCoveredHandler }
