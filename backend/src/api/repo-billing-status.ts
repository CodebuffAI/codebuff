import {
  Request as ExpressRequest,
  Response as ExpressResponse,
  NextFunction,
} from 'express'
import { z } from 'zod'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { and, eq } from 'drizzle-orm'

import { checkAuth } from '../util/check-auth'
import { getUserIdFromAuthToken } from '../websockets/auth' // Re-using this helper
import { logger } from '@/util/logger'

const repoBillingStatusRequestSchema = z.object({
  fingerprintId: z.string(),
  authToken: z.string().optional(),
  repoUrl: z.string().url(), // Expecting a full URL
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
      // This case might be for anonymous users or if token is invalid
      // For now, let's assume an org can't cover a repo for an unauthenticated user.
      // Or, if the repo is public and covered by an org, maybe it should still show?
      // For now, require userId to check org membership.
      return res
        .status(401)
        .json({ isOrgCovered: false, error: 'Authentication required' })
    }

    // Find if the repo is associated with an active organization
    const orgRepoEntry = await db
      .select({
        orgId: schema.orgRepo.org_id,
        orgName: schema.org.name,
      })
      .from(schema.orgRepo)
      .innerJoin(schema.org, eq(schema.orgRepo.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgRepo.repo_url, repoUrl),
          eq(schema.orgRepo.is_active, true)
        )
      )
      .limit(1)
      .then((rows) => rows[0])

    if (!orgRepoEntry) {
      return res.status(200).json({ isOrgCovered: false })
    }

    // Check if the authenticated user is a member of that organization
    const orgMemberEntry = await db
      .select({ userId: schema.orgMember.user_id })
      .from(schema.orgMember)
      .where(
        and(
          eq(schema.orgMember.org_id, orgRepoEntry.orgId),
          eq(schema.orgMember.user_id, userId)
        )
      )
      .limit(1)
      .then((rows) => rows[0])

    if (orgMemberEntry) {
      return res
        .status(200)
        .json({ isOrgCovered: true, orgName: orgRepoEntry.orgName })
    } else {
      // Repo is managed by an org, but this user isn't part of it.
      // Or, user is part of the org, but this specific repo isn't linked for billing.
      // For simplicity, if the user is not in the org that covers the repo, we say it's not covered for them.
      return res.status(200).json({ isOrgCovered: false })
    }
  } catch (error) {
    logger.error({ error }, 'Error handling /api/repo-billing-status request')
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        isOrgCovered: false,
        error: 'Invalid request body',
        // issues: error.errors // Optionally include detailed validation issues
      })
    }
    // Pass to generic error handler
    next(error)
    return
  }
}

export default repoBillingStatusHandler
