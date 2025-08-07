import { findOrganizationForRepository } from '@codebuff/billing'
import { z } from 'zod'

import { logger } from '../util/logger'
import { getUserIdFromAuthToken } from '../websockets/websocket-action'

const isRepoCoveredRequestSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  remoteUrl: z.string(),
})

async function isRepoCoveredHandler(
  req: Request,
  ok: (body: any, init?: ResponseInit) => Response,
): Promise<Response> {
  try {
    const body = await req.json()
    const { owner, repo, remoteUrl } = isRepoCoveredRequestSchema.parse(body)

    const authHeader = req.headers.get('authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Missing or invalid authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const authToken = authHeader.substring(7)
    const userId = await getUserIdFromAuthToken(authToken)
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication token' }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    const orgLookup = await findOrganizationForRepository(userId, remoteUrl)
    return ok({
      isCovered: orgLookup.found,
      organizationName: orgLookup.organizationName,
      organizationId: orgLookup.organizationId,
      organizationSlug: orgLookup.organizationSlug,
    })
  } catch (error) {
    logger.error({ error }, 'Error handling /api/orgs/is-repo-covered request')
    if (error instanceof z.ZodError) {
      return new Response(
        JSON.stringify({ error: 'Invalid request body', issues: error.errors }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      )
    }
    return new Response('Something broke!', { status: 500 })
  }
}

export { isRepoCoveredHandler }
