import { failure, success } from '@codebuff/common/util/error'
import db from '@codebuff/internal/db'
import * as schema from '@codebuff/internal/db/schema'
import { eq, and } from 'drizzle-orm'

import { consumeCredits } from './balance-calculator'
import {
  consumeOrganizationCredits,
  normalizeRepositoryUrl,
  extractOwnerAndRepo,
} from './org-billing'

import type { ConsumeCreditsWithFallbackFn, BillingDbConnection } from '@codebuff/common/types/contracts/billing'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ParamsOf } from '@codebuff/common/types/function-params'

export interface OrganizationLookupResult {
  found: boolean
  organizationId?: string
  organizationName?: string
  organizationSlug?: string
}

export interface CreditDelegationResult {
  success: boolean
  organizationId?: string
  organizationName?: string
  error?: string
  organizationSlug?: string
}

/**
 * Dependencies for findOrganizationForRepository (for testing)
 */
export interface FindOrganizationForRepositoryDeps {
  db?: BillingDbConnection
}

/**
 * Finds the organization associated with a repository for a given user.
 * Uses owner/repo comparison for better matching.
 */
export async function findOrganizationForRepository(params: {
  userId: string
  repositoryUrl: string
  logger: Logger
  deps?: FindOrganizationForRepositoryDeps
}): Promise<OrganizationLookupResult> {
  const { userId, repositoryUrl, logger, deps = {} } = params
  // Cast to BillingDbConnection to allow either real db or mock to be used
  const dbClient = (deps.db ?? db) as BillingDbConnection

  try {
    const normalizedUrl = normalizeRepositoryUrl(repositoryUrl)
    const ownerRepo = extractOwnerAndRepo(normalizedUrl)

    if (!ownerRepo) {
      logger.debug(
        { userId, repositoryUrl, normalizedUrl },
        'Could not extract owner/repo from repository URL',
      )
      return { found: false }
    }

    // First, check if user is a member of any organizations
    const userOrganizations = await dbClient
      .select({
        orgId: schema.orgMember.org_id,
        orgName: schema.org.name,
        orgSlug: schema.org.slug, // Select the slug
      })
      .from(schema.orgMember)
      .innerJoin(schema.org, eq(schema.orgMember.org_id, schema.org.id))
      .where(eq(schema.orgMember.user_id, userId)) as unknown as { orgId: string; orgName: string; orgSlug: string }[]

    if (userOrganizations.length === 0) {
      logger.debug(
        { userId, repositoryUrl },
        'User is not a member of any organizations',
      )
      return { found: false }
    }

    // Check each organization for matching repositories
    for (const userOrg of userOrganizations) {
      const orgRepos = await dbClient
        .select({
          repoUrl: schema.orgRepo.repo_url,
          repoName: schema.orgRepo.repo_name,
          isActive: schema.orgRepo.is_active,
        })
        .from(schema.orgRepo)
        .where(
          and(
            eq(schema.orgRepo.org_id, userOrg.orgId),
            eq(schema.orgRepo.is_active, true),
          ),
        ) as unknown as { repoUrl: string; repoName: string; isActive: boolean }[]

      // Check if any repository in this organization matches
      for (const orgRepo of orgRepos) {
        const orgOwnerRepo = extractOwnerAndRepo(orgRepo.repoUrl)

        if (
          orgOwnerRepo &&
          orgOwnerRepo.owner === ownerRepo.owner &&
          orgOwnerRepo.repo === ownerRepo.repo
        ) {
          logger.info(
            {
              userId,
              repositoryUrl,
              organizationId: userOrg.orgId,
              organizationName: userOrg.orgName,
              organizationSlug: userOrg.orgSlug, // Return the slug
              matchedRepoUrl: orgRepo.repoUrl,
              ownerRepo: ownerRepo,
            },
            'Found organization for repository using owner/repo matching',
          )

          return {
            found: true,
            organizationId: userOrg.orgId,
            organizationName: userOrg.orgName,
            organizationSlug: userOrg.orgSlug, // Return the slug
          }
        }
      }
    }

    logger.debug(
      {
        userId,
        repositoryUrl,
        ownerRepo,
        userOrganizations: userOrganizations.length,
      },
      'No organization found for repository',
    )

    return { found: false }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, error },
      'Error finding organization for repository',
    )
    return { found: false }
  }
}

/**
 * Consumes credits with organization delegation if applicable.
 */
export async function consumeCreditsWithDelegation(params: {
  userId: string
  repositoryUrl: string | null
  creditsToConsume: number
  logger: Logger
}): Promise<CreditDelegationResult> {
  const { userId, repositoryUrl, creditsToConsume, logger } = params

  // If no repository URL, fall back to personal credits
  if (!repositoryUrl) {
    logger.debug(
      { userId, creditsToConsume },
      'No repository URL provided, falling back to personal credits',
    )
    return { success: false, error: 'No repository URL provided' }
  }

  const withRepoUrl = { ...params, repositoryUrl }

  try {
    // Find organization for this repository
    const orgLookup = await findOrganizationForRepository(withRepoUrl)

    if (!orgLookup.found || !orgLookup.organizationId) {
      logger.debug(
        { userId, repositoryUrl, creditsToConsume },
        'No organization found for repository, falling back to personal credits',
      )
      return { success: false, error: 'No organization found for repository' }
    }

    // Consume credits from organization
    try {
      await consumeOrganizationCredits({
        ...params,
        organizationId: orgLookup.organizationId,
      })

      logger.info(
        {
          userId,
          repositoryUrl,
          organizationId: orgLookup.organizationId,
          organizationName: orgLookup.organizationName,
          organizationSlug: orgLookup.organizationSlug, // Return the slug
          creditsToConsume,
        },
        'Successfully consumed credits from organization',
      )

      return {
        success: true,
        organizationId: orgLookup.organizationId,
        organizationName: orgLookup.organizationName,
        organizationSlug: orgLookup.organizationSlug, // Return the slug
      }
    } catch (consumeError) {
      logger.error(
        {
          userId,
          repositoryUrl,
          organizationId: orgLookup.organizationId,
          creditsToConsume,
          error: consumeError,
        },
        'Failed to consume credits from organization',
      )

      return {
        success: false,
        error: 'Failed to consume organization credits',
        organizationId: orgLookup.organizationId,
        organizationName: orgLookup.organizationName,
        organizationSlug: orgLookup.organizationSlug, // Return the slug
      }
    }
  } catch (error) {
    logger.error(
      { userId, repositoryUrl, creditsToConsume, error },
      'Error in credit delegation process',
    )

    return { success: false, error: 'Credit delegation process failed' }
  }
}

/**
 * Helper function that decides whether to charge credits to an organization or user directly.
 * Tries organization delegation first if a repo URL is available, falls back to personal credits.
 */
export async function consumeCreditsWithFallback(
  params: ParamsOf<ConsumeCreditsWithFallbackFn>,
): ReturnType<ConsumeCreditsWithFallbackFn> {
  const { userId, creditsToCharge, repoUrl, context, logger } = params

  try {
    // Try organization delegation first if repo URL is available
    if (repoUrl) {
      const delegationResult = await consumeCreditsWithDelegation({
        ...params,
        repositoryUrl: repoUrl,
        creditsToConsume: creditsToCharge,
      })

      if (delegationResult.success) {
        logger.debug(
          {
            userId,
            creditsToCharge,
            organizationId: delegationResult.organizationId,
            context,
          },
          `Charged organization credits for ${context}`,
        )

        return success({
          organizationId: delegationResult.organizationId,
          organizationName: delegationResult.organizationName,
          chargedToOrganization: true,
        })
      }
    }

    // Fall back to personal credits
    await consumeCredits({
      userId,
      creditsToConsume: creditsToCharge,
      logger,
    })
    logger.debug(
      { userId, creditsToCharge, context },
      `Charged personal credits for ${context}`,
    )

    return success({
      chargedToOrganization: false,
    })
  } catch (error) {
    logger.error(
      { error, userId, creditsToCharge, context },
      `Failed to charge credits for ${context}`,
    )

    return failure(error)
  }
}
