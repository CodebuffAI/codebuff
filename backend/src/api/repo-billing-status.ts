import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'
import { extractOrgAndRepoFromUrl } from '@codebuff/billing'

import { checkAuth } from '../util/check-auth'
import { getUserIdFromAuthToken } from '../websockets/auth' // Re-using this helper
import { logger } from '@/util/logger'

const repoBillingStatusRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  repoUrl: z
    .string()
    .min(1, 'Repository URL is required')
    .refine(
      (url) => {
        const parseResult = extractOrgAndRepoFromUrl(url)
        return parseResult.isValid
      },
      {
        message:
          'Invalid repository URL format. Supported formats: HTTP(S), git@host:path/repo, ssh://user@host/path/repo.',
      }
    ),
})

interface RepoBillingStatusResponse {
  isOrgCovered: boolean
  orgName?: string
  error?: string
}

async function repoBillingStatusHandler(
  req: ExpressRequest,
  res: ExpressResponse,
  next: NextFunction
): Promise<void | ExpressResponse<RepoBillingStatusResponse>> {
  try {
    const { fingerprintId, authToken, repoUrl } =
      repoBillingStatusRequestSchema.parse(req.body)
    const clientSessionId = `api-repo-billing-${fingerprintId}-${Date.now()}`

    // Extract org and repo names from the repository URL
    const repoParseResult = extractOrgAndRepoFromUrl(repoUrl)
    if (!repoParseResult.isValid) {
      return res.status(400).json({
        isOrgCovered: false,
        error: repoParseResult.error || 'Invalid repository URL',
      })
    }
    const { host, owner, repo } = repoParseResult

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
      return res.status(401).json({ isOrgCovered: false, error: errorMessage })
    }

    const userId = authToken
      ? await getUserIdFromAuthToken(authToken)
      : undefined

    if (!userId) {
      return res
        .status(401)
        .json({ isOrgCovered: false, error: 'Authentication required' })
    }

    // Fetch all active repository URLs from the database and extract their org/repo names for comparison
    const allOrgRepos = await db
      .select({
        orgId: schema.orgRepo.org_id,
        orgName: schema.org.name,
        repoUrl: schema.orgRepo.repo_url,
      })
      .from(schema.orgRepo)
      .innerJoin(schema.org, eq(schema.orgRepo.org_id, schema.org.id))
      .where(eq(schema.orgRepo.is_active, true))

    // Find a matching repository by extracting org/repo names from each stored URL and comparing
    let matchingOrgRepo: { orgId: string; orgName: string } | undefined

    for (const orgRepo of allOrgRepos) {
      const storedParseResult = extractOrgAndRepoFromUrl(orgRepo.repoUrl)

      if (
        storedParseResult.isValid &&
        storedParseResult.host === host &&
        storedParseResult.owner === owner &&
        storedParseResult.repo === repo
      ) {
        matchingOrgRepo = {
          orgId: orgRepo.orgId,
          orgName: orgRepo.orgName,
        }
        break
      }
    }

    if (!matchingOrgRepo) {
      return res.status(200).json({ isOrgCovered: false })
    }

    // Check if the authenticated user is a member of that organization
    const orgMemberEntry = await db
      .select({ userId: schema.orgMember.user_id })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, matchingOrgRepo.orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)
      .then((rows) => rows[0])

    if (orgMemberEntry) {
      return res
        .status(200)
        .json({ isOrgCovered: true, orgName: matchingOrgRepo.orgName })
    } else {
      return res.status(200).json({ isOrgCovered: false })
    }
  } catch (error) {
    logger.error({ error }, 'repoBillingStatusHandler: Error handling request')
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        isOrgCovered: false,
        error: 'Invalid request body',
      })
    }
    // Pass to generic error handler
    next(error)
    return
  }
}

export default repoBillingStatusHandler
