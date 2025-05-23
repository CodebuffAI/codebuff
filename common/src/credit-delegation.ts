import db from './db'
import * as schema from './db/schema'
import { eq, and } from 'drizzle-orm'
import { InferSelectModel } from 'drizzle-orm'

export interface OrganizationLookupResult {
  found: boolean
  organizationId?: string
  organizationName?: string
}

export interface CreditDelegationResult {
  useOrganization: boolean
  organizationId?: string
  organizationName?: string
  fallbackToPersonal: boolean
}

type OrgRepoSelect = InferSelectModel<typeof schema.orgRepo>
type OrgSelect = InferSelectModel<typeof schema.org>

type OrgRepoWithOrg = OrgRepoSelect & {
  org: Pick<OrgSelect, 'id' | 'name'> | null
}

/**
 * Finds the organization associated with a repository for a given user
 */
export async function findOrganizationForRepository(
  userId: string,
  repositoryUrl: string
): Promise<OrganizationLookupResult> {
  try {
    // Normalize repository URL (remove trailing slash, convert to lowercase)
    const normalizedUrl = repositoryUrl.toLowerCase().replace(/\/$/, '')
    
    // Find the repository in org_repo table
    const orgRepo = await db.query.orgRepo.findFirst({
      where: and(
        eq(schema.orgRepo.repo_url, normalizedUrl),
        eq(schema.orgRepo.is_active, true)
      ),
      with: {
        org: {
          columns: {
            id: true,
            name: true,
          }
        }
      }
    }) as OrgRepoWithOrg | undefined

    if (!orgRepo) {
      return { found: false }
    }

    // Explicitly check if org relation was loaded
    if (!orgRepo.org) {
      console.error(`Organization details not loaded for org_id: ${orgRepo.org_id}`)
      return { found: false }
    }

    // Check if the user is a member of this organization
    const membership = await db.query.orgMember.findFirst({
      where: and(
        eq(schema.orgMember.org_id, orgRepo.org_id),
        eq(schema.orgMember.user_id, userId)
      )
    })

    if (!membership) {
      return { found: false }
    }

    return {
      found: true,
      organizationId: orgRepo.org_id,
      organizationName: orgRepo.org.name
    }
  } catch (error) {
    console.error('Error finding organization for repository:', error)
    return { found: false }
  }
}

/**
 * Determines credit delegation for a user and repository
 */
export async function consumeCreditsWithDelegation(
  userId: string,
  repositoryUrl: string,
  creditsToConsume: number
): Promise<CreditDelegationResult> {
  const orgLookup = await findOrganizationForRepository(userId, repositoryUrl)
  
  if (orgLookup.found) {
    return {
      useOrganization: true,
      organizationId: orgLookup.organizationId,
      organizationName: orgLookup.organizationName,
      fallbackToPersonal: false
    }
  }

  return {
    useOrganization: false,
    fallbackToPersonal: true
  }
}