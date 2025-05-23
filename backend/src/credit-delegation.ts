import {
  consumeCredits,
  consumeOrganizationCredits,
  normalizeRepositoryUrl,
  sendOrganizationAlert,
  monitorOrganizationCredits,
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

export interface OrganizationLookupResult {
  organizationId?: string
  organizationName?: string
  found: boolean
}

/**
 * Looks up which organization (if any) has approved a repository for a given user.
 * This is now a separate, explicit step that callers can use to determine
 * which organization to pass to consumeCreditsWithDelegation.
 */
export async function findOrganizationForRepository(
  userId: string,
  repositoryUrl: string
): Promise<OrganizationLookupResult> {
  try {
    const normalizedUrl = normalizeRepositoryUrl(repositoryUrl)

    // Find if this repository is approved for any organization the user belongs to
    const approvedOrgs = await db
      .select({
        organizationId: schema.orgRepo.org_id,
        organizationName: schema.org.name,
      })
      .from(schema.orgRepo)
      .innerJoin(
        schema.orgMember,
        eq(schema.orgRepo.org_id, schema.orgMember.org_id)
      )
      .innerJoin(schema.org, eq(schema.orgRepo.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgMember.user_id, userId),
          eq(schema.orgRepo.repo_url, normalizedUrl),
          eq(schema.orgRepo.is_active, true)
        )
      )
      .limit(1) // Use first matching organization

    if (approvedOrgs.length === 0) {
      return { found: false }
    }

    const { organizationId, organizationName } = approvedOrgs[0]
    return {
      organizationId,
      organizationName,
      found: true,
    }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, error },
      'Error looking up organization for repository'
    )
    return { found: false }
  }
}



/**
 * Consumes credits from either user or organization based on explicit parameters.
 *
 * @param userId - The user consuming credits
 * @param creditsUsed - Number of credits to consume
 * @param organizationId - Optional organization ID to consume from. If provided, will use organization credits.
 * @param repositoryUrl - Optional repository URL for validation and logging
 */
export async function consumeCreditsWithDelegation(
  userId: string,
  creditsUsed: number,
  organizationId?: string,
  repositoryUrl?: string
): Promise<CreditDelegationResult> {
  try {
    // If no organization ID specified, use user credits
    if (!organizationId) {
      logger.debug(
        { userId, repositoryUrl },
        'No organization specified, using user credits'
      )

      const result = await consumeCredits(userId, creditsUsed)
      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: false,
      }
    }

    // Validate that user is a member of the specified organization
    const membership = await db
      .select({
        role: schema.orgMember.role,
        organizationName: schema.org.name,
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(
        and(
          eq(schema.orgMember.user_id, userId),
          eq(schema.orgMember.org_id, organizationId)
        )
      )
      .limit(1)

    if (membership.length === 0) {
      logger.warn(
        { userId, organizationId },
        'User is not a member of specified organization, using user credits'
      )

      const result = await consumeCredits(userId, creditsUsed)
      return {
        success: true,
        consumed: result.consumed,
        fromOrganization: false,
      }
    }

    const { organizationName } = membership[0]

    // If repository URL is provided, validate that the organization has approved it
    if (repositoryUrl) {
      const normalizedUrl = normalizeRepositoryUrl(repositoryUrl)

      const approvedRepo = await db
        .select()
        .from(schema.orgRepo)
        .where(
          and(
            eq(schema.orgRepo.org_id, organizationId),
            eq(schema.orgRepo.repo_url, normalizedUrl),
            eq(schema.orgRepo.is_active, true)
          )
        )
        .limit(1)

      if (approvedRepo.length === 0) {
        logger.warn(
          { userId, organizationId, repositoryUrl: normalizedUrl },
          'Repository not approved for organization, using user credits'
        )

        const result = await consumeCredits(userId, creditsUsed)
        return {
          success: true,
          consumed: result.consumed,
          fromOrganization: false,
          organizationId, // Include org ID to show which org was attempted
        }
      }
    }

    // Try to consume organization credits
    try {
      const result = await consumeOrganizationCredits(
        organizationId,
        creditsUsed
      )

      logger.info(
        {
          userId,
          organizationId,
          organizationName,
          creditsUsed,
          repositoryUrl,
        },
        'Successfully consumed organization credits'
      )

      // Monitor organization credits after consumption
      try {
        // Get current balance for monitoring (simplified - in production would get actual balance)
        await monitorOrganizationCredits(
          organizationId,
          0,
          creditsUsed,
          organizationName
        )
      } catch (monitorError) {
        logger.warn(
          { organizationId, monitorError },
          'Failed to monitor organization credits'
        )
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
          metadata: { userId, creditsUsed, repositoryUrl },
        })
      } catch (alertError) {
        logger.warn(
          { organizationId, alertError },
          'Failed to send organization alert'
        )
      }

      // No fallback - organization credit consumption failed
      logger.warn(
        {
          userId,
          organizationId,
          organizationName,
          creditsUsed,
          orgError: orgError instanceof Error ? orgError.message : 'Unknown error',
        },
        'Organization credit consumption failed - no fallback to personal credits'
      )

      return {
        success: false,
        consumed: 0,
        fromOrganization: false,
        organizationId,
        error: `Insufficient organization credits: ${orgError instanceof Error ? orgError.message : 'Unknown error'}`,
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
