
import { z } from 'zod'
import { findOrganizationForRepository } from '@codebuff/billing'

import { getUserIdFromAuthToken } from '../websockets/websocket-action'
import { logger } from '../util/logger'

const isRepoCoveredRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  remoteUrl: z.string(),
})

async function isRepoCoveredHandler(body: any, authHeader: string | null): Promise<any> {
  let owner: string, repo: string, remoteUrl: string
  
  try {
    ({ owner, repo, remoteUrl } = isRepoCoveredRequestSchema.parse(body))
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ error: error.errors }, 'Invalid request body for /api/orgs/is-repo-covered')
      throw new Error('Invalid request body')
    }
    throw error
  }
  
  // Get user ID from Authorization header
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header')
  }
  
  const authToken = authHeader.substring(7) // Remove 'Bearer ' prefix
  const userId = await getUserIdFromAuthToken(authToken)
  
  if (!userId) {
    throw new Error('Invalid authentication token')
  }

  // Check if repository is covered by an organization
  const orgLookup = await findOrganizationForRepository(userId, remoteUrl)
  
  return {
    isCovered: orgLookup.found,
    organizationName: orgLookup.organizationName,
    organizationId: orgLookup.organizationId, // Keep organizationId for now, might be used elsewhere
    organizationSlug: orgLookup.organizationSlug, // Add organizationSlug
  }
}

export { isRepoCoveredHandler }
