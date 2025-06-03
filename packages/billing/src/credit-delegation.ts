import db from 'common/db'
import * as schema from 'common/db/schema'
import { eq, and } from 'drizzle-orm'
import { logger } from 'common/util/logger'
import { 
  consumeOrganizationCredits, 
  normalizeRepositoryUrl,
  extractOwnerAndRepo
} from './org-billing'

export interface OrganizationLookupResult {
  found: boolean
  organizationId?: string
  organizationName?: string
}

export interface CreditDelegationResult {
  success: boolean
  organizationId?: string
  organizationName?: string
  error?: string
}

/**
 * Finds the organization associated with a repository for a given user.
 * Uses owner/repo comparison for better matching.
 */
export async function findOrganizationForRepository(
  userId: string,
  repositoryUrl: string
): Promise<OrganizationLookupResult> {
  try {
    const normalizedUrl = normalizeRepositoryUrl(repositoryUrl)
    const ownerRepo = extractOwnerAndRepo(normalizedUrl)
    
    if (!ownerRepo) {
      logger.debug(
        { userId, repositoryUrl, normalizedUrl },
        'Could not extract owner/repo from repository URL'
      )
      return { found: false }
    }

    // First, check if user is a member of any organizations
    const userOrganizations = await db
      .select({
        orgId: schema.orgMember.org_id,
        orgName: schema.org.name,
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(eq(schema.orgMember.user_id, userId))

    if (userOrganizations.length === 0) {
      logger.debug(
        { userId, repositoryUrl },
        'User is not a member of any organizations'
      )
      return { found: false }
    }

    // Check each organization for matching repositories
    for (const userOrg of userOrganizations) {
      const orgRepos = await db
        .select({
          repoUrl: schema.orgRepo.repo_url,
          repoName: schema.orgRepo.repo_name,
          isActive: schema.orgRepo.is_active,
        })
        .from(schema.orgRepo)
        .where(
          and(
            eq(schema.orgRepo.org_id, userOrg.orgId),
            eq(schema.orgRepo.is_active, true)
          )
        )

      // Check if any repository in this organization matches
      for (const orgRepo of orgRepos) {
        const orgOwnerRepo = extractOwnerAndRepo(orgRepo.repoUrl)
        
        if (orgOwnerRepo && 
            orgOwnerRepo.owner === ownerRepo.owner && 
            orgOwnerRepo.repo === ownerRepo.repo) {
          logger.info(
            { 
              userId, 
              repositoryUrl, 
              organizationId: userOrg.orgId,
              organizationName: userOrg.orgName,
              matchedRepoUrl: orgRepo.repoUrl,
              ownerRepo: ownerRepo
            },
            'Found organization for repository using owner/repo matching'
          )
          
          return {
            found: true,
            organizationId: userOrg.orgId,
            organizationName: userOrg.orgName,
          }
        }
      }
    }

    logger.debug(
      { userId, repositoryUrl, ownerRepo, userOrganizations: userOrganizations.length },
      'No organization found for repository'
    )
    
    return { found: false }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, error },
      'Error finding organization for repository'
    )
    return { found: false }
  }
}

/**
 * Consumes credits with organization delegation if applicable.
 */
export async function consumeCreditsWithDelegation(
  userId: string,
  repositoryUrl: string | null,
  creditsToConsume: number
): Promise<CreditDelegationResult> {
  try {
    // If no repository URL, fall back to personal credits
    if (!repositoryUrl) {
      logger.debug(
        { userId, creditsToConsume },
        'No repository URL provided, falling back to personal credits'
      )
      return { success: false, error: 'No repository URL provided' }
    }

    // Find organization for this repository
    const orgLookup = await findOrganizationForRepository(userId, repositoryUrl)
    
    if (!orgLookup.found || !orgLookup.organizationId) {
      logger.debug(
        { userId, repositoryUrl, creditsToConsume },
        'No organization found for repository, falling back to personal credits'
      )
      return { success: false, error: 'No organization found for repository' }
    }

    // Consume credits from organization
    try {
      await consumeOrganizationCredits(orgLookup.organizationId, creditsToConsume)
      
      logger.info(
        { 
          userId, 
          repositoryUrl, 
          organizationId: orgLookup.organizationId,
          organizationName: orgLookup.organizationName,
          creditsToConsume 
        },
        'Successfully consumed credits from organization'
      )
      
      return {
        success: true,
        organizationId: orgLookup.organizationId,
        organizationName: orgLookup.organizationName,
      }
    } catch (consumeError) {
      logger.error(
        { 
          userId, 
          repositoryUrl, 
          organizationId: orgLookup.organizationId,
          creditsToConsume,
          error: consumeError 
        },
        'Failed to consume credits from organization'
      )
      
      return { 
        success: false, 
        error: 'Failed to consume organization credits',
        organizationId: orgLookup.organizationId,
        organizationName: orgLookup.organizationName,
      }
    }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, creditsToConsume, error },
      'Error in credit delegation process'
    )
    
    return { success: false, error: 'Credit delegation process failed' }
  }
}
