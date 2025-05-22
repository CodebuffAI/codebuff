import { consumeCredits, consumeOrganizationCredits, normalizeRepositoryUrl } from '@codebuff/billing'
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
        organizationId: schema.organizationRepository.organization_id,
        organizationName: schema.organization.name
      })
      .from(schema.organizationRepository)
      .innerJoin(
        schema.organizationMember, 
        eq(schema.organizationRepository.organization_id, schema.organizationMember.organization_id)
      )
      .innerJoin(
        schema.organization,
        eq(schema.organizationRepository.organization_id, schema.organization.id)
      )
      .where(
        and(
          eq(schema.organizationMember.user_id, userId),
          eq(schema.organizationRepository.repository_url, normalizedUrl),
          eq(schema.organizationRepository.is_active, true)
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

      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: true,
        organizationId,
      }
    } catch (orgError) {
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
