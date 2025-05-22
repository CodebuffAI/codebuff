import { 
  consumeCredits, 
  consumeOrganizationCredits, 
  normalizeRepositoryUrl,
  sendOrganizationAlert,
  monitorOrganizationCredits
} from '@codebuff/billing'
import { logger } from './util/logger'
import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'

export interface CreditDelegationResult {
  success: boolean
  consumed: number
  fromOrganization: boolean
  organizationId?: string
  error?: string
}

/**
 * Determines whether to use organization or user credits based on repository URL
 * and consumes the appropriate credits.
 */
export async function consumeCreditsWithDelegation(
  userId: string,
  creditsUsed: number,
  repositoryUrl?: string
): Promise<CreditDelegationResult> {
  try {
    // If no repository URL, use user credits
    if (!repositoryUrl) {
      const result = await consumeCredits(userId, creditsUsed)
      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: false,
      }
    }

    // Normalize repository URL
    const normalizedUrl = normalizeRepositoryUrl(repositoryUrl)

    // Find if this repository is approved for any organization the user belongs to
    const approvedOrgs = await db
      .select({ 
        organizationId: schema.orgRepo.org_id,
        organizationName: schema.org.name
      })
      .from(schema.orgRepo)
      .innerJoin(
        schema.orgMember, 
        eq(schema.orgRepo.org_id, schema.orgMember.org_id)
      )
      .innerJoin(
        schema.org,
        eq(schema.orgRepo.org_id, schema.org.id)
      )
      .where(
        and(
          eq(schema.orgMember.user_id, userId),
          eq(schema.orgRepo.repo_url, normalizedUrl),
          eq(schema.orgRepo.is_active, true)
        )
      )
      .limit(1) // Use first matching organization

    // If no organization approves this repo, use user credits
    if (approvedOrgs.length === 0) {
      logger.debug(
        { userId, repositoryUrl: normalizedUrl },
        'No organization found for repository, using user credits'
      )
      
      const result = await consumeCredits(userId, creditsUsed)
      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: false,
      }
    }

    const { organizationId, organizationName } = approvedOrgs[0]

    // Try to consume organization credits
    try {
      const result = await consumeOrganizationCredits(organizationId, creditsUsed)
      
      logger.info(
        { userId, organizationId, organizationName, creditsUsed, repositoryUrl: normalizedUrl },
        'Successfully consumed organization credits'
      )

      // Monitor organization credits after consumption
      try {
        // Get current balance for monitoring (simplified - in production would get actual balance)
        await monitorOrganizationCredits(organizationId, 0, creditsUsed, organizationName)
      } catch (monitorError) {
        logger.warn({ organizationId, monitorError }, 'Failed to monitor organization credits')
      }

      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: true,
        organizationId,
      }
    } catch (orgError) {
      // Send alert about failed consumption
      try {
        await sendOrganizationAlert({
          organizationId,
          organizationName,
          alertType: 'failed_consumption',
          error: orgError instanceof Error ? orgError.message : 'Unknown error',
          metadata: { userId, creditsUsed, repositoryUrl: normalizedUrl }
        })
      } catch (alertError) {
        logger.warn({ organizationId, alertError }, 'Failed to send organization alert')
      }

      // If organization credits fail (e.g., insufficient balance), fall back to user credits
      logger.warn(
        { userId, organizationId, organizationName, creditsUsed, error: orgError },
        'Organization credit consumption failed, falling back to user credits'
      )

      const result = await consumeCredits(userId, creditsUsed)
      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: false,
        organizationId, // Still include org ID to show which org was attempted
      }
    }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, creditsUsed, error },
      'Error in credit delegation'
    )
    
    return {
      success: false,
      consumed: 0,
      fromOrganization: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
