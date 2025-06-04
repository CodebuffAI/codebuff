import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import { findOrganizationForRepository } from '@codebuff/billing'

import { getUserIdFromAuthToken } from '../websockets/websocket-action'
import { logger } from '@/util/logger'

const isRepoCoveredRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  remoteUrl: z.string(),
})

async function isRepoCoveredHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse> {
  try {
    const { owner, repo, remoteUrl } = isRepoCoveredRequestSchema.parse(req.body)
    
    // Get user ID from Authorization header
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' })
    }
    
    const authToken = authHeader.substring(7) // Remove 'Bearer ' prefix
    const userId = await getUserIdFromAuthToken(authToken)
    
    if (!userId) {
      return res.status(401).json({ error: 'Invalid authentication token' })
    }

    // Check if repository is covered by an organization
    const orgLookup = await findOrganizationForRepository(userId, remoteUrl)
    
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
        .json({ error: 'Invalid request body', issues: error.errors })
    }
    next(error)
    return
  }
}

export { isRepoCoveredHandler }
