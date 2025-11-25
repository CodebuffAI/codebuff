import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { INVALID_AUTH_TOKEN_MESSAGE } from '@codebuff/common/old-constants'
import { NextResponse } from 'next/server'
import { z } from 'zod/v4'

import { extractApiKeyFromHeader } from '@/util/auth'

import type { TrackEventFn } from '@codebuff/common/types/contracts/analytics'
import type {
  GetUserInfoFromApiKeyFn,
} from '@codebuff/common/types/contracts/database'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { NextRequest } from 'next/server'

import type { GetOrganizationUsageResponseFn, GetUserUsageDataFn } from '@codebuff/common/types/contracts/billing'

const usageRequestSchema = z.object({
  fingerprintId: z.string(),
  // DEPRECATED: authToken in body is for backwards compatibility with older CLI versions.
  // New clients should use the Authorization header instead.
  authToken: z.string().optional(),
  orgId: z.string().optional(),
})

export async function postUsage(params: {
  req: NextRequest
  getUserInfoFromApiKey: GetUserInfoFromApiKeyFn
  getUserUsageData: GetUserUsageDataFn
  getOrganizationUsageResponse: GetOrganizationUsageResponseFn
  trackEvent: TrackEventFn
  logger: Logger
}) {
  const {
    req,
    getUserInfoFromApiKey,
    getUserUsageData,
    getOrganizationUsageResponse,
    trackEvent,
    logger,
  } = params

  try {
    let body: unknown
    try {
      body = await req.json()
    } catch (error) {
      return NextResponse.json(
        { message: 'Invalid JSON in request body' },
        { status: 400 },
      )
    }

    const parseResult = usageRequestSchema.safeParse(body)
    if (!parseResult.success) {
      return NextResponse.json(
        { message: 'Invalid request body', issues: parseResult.error.issues },
        { status: 400 },
      )
    }

    const { fingerprintId, authToken: bodyAuthToken, orgId } = parseResult.data

    // Prefer Authorization header, fall back to body authToken for backwards compatibility
    const authToken = extractApiKeyFromHeader(req) ?? bodyAuthToken

    if (!authToken) {
      return NextResponse.json(
        { message: 'Authentication required' },
        { status: 401 },
      )
    }

    const userInfo = await getUserInfoFromApiKey({
      apiKey: authToken,
      fields: ['id'],
      logger,
    })

    if (!userInfo) {
      trackEvent({
        event: AnalyticsEvent.USAGE_API_AUTH_ERROR,
        userId: 'unknown',
        properties: {
          reason: 'Invalid API key',
        },
        logger,
      })
      return NextResponse.json(
        { message: INVALID_AUTH_TOKEN_MESSAGE },
        { status: 401 },
      )
    }

    const userId = userInfo.id

    trackEvent({
      event: AnalyticsEvent.USAGE_API_REQUEST,
      userId,
      properties: {
        fingerprintId,
        hasOrgId: !!orgId,
      },
      logger,
    })

    // If orgId is provided, return organization usage data
    if (orgId) {
      try {
        const orgUsageResponse = await getOrganizationUsageResponse({
          organizationId: orgId,
          userId,
          logger,
        })
        return NextResponse.json(orgUsageResponse)
      } catch (error) {
        logger.error(
          { error, orgId, userId },
          'Error fetching organization usage',
        )
        // If organization usage fails, fall back to personal usage
        logger.info(
          { orgId, userId },
          'Falling back to personal usage due to organization error',
        )
      }
    }

    // Return personal usage data (default behavior)
    const usageData = await getUserUsageData({ userId, logger })

    // Format response to match backend API format
    const usageResponse = {
      type: 'usage-response' as const,
      usage: usageData.usageThisCycle,
      remainingBalance: usageData.balance.totalRemaining,
      balanceBreakdown: usageData.balance.breakdown,
      next_quota_reset: usageData.nextQuotaReset,
    }

    return NextResponse.json(usageResponse)
  } catch (error) {
    logger.error({ error }, 'Error handling /api/v1/usage request')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
