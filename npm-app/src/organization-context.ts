import { logger } from './utils/logger'
import { getProjectRoot, getCurrentRepositoryUrl } from './project-files'
import { Client } from './client'

export interface OrganizationContext {
  organizationId?: string
  organizationName?: string
  repositoryUrl?: string
  usingOrganizationCredits: boolean
  organizationBalance?: number
  userBalance?: number
}

/**
 * Determines organization context for the current project
 */
export async function getOrganizationContext(client: Client): Promise<OrganizationContext> {
  try {
    const repositoryUrl = await getCurrentRepositoryUrl()
    
    if (!repositoryUrl) {
      return {
        usingOrganizationCredits: false,
      }
    }

    // Check if this repository is associated with an organization
    // This would typically be done via an API call to the backend
    // For now, we'll implement a placeholder
    
    const context: OrganizationContext = {
      repositoryUrl,
      usingOrganizationCredits: false,
    }

    // TODO: Implement API call to check organization association
    // const orgInfo = await client.checkOrganizationForRepository(repositoryUrl)
    // if (orgInfo) {
    //   context.organizationId = orgInfo.id
    //   context.organizationName = orgInfo.name
    //   context.usingOrganizationCredits = true
    //   context.organizationBalance = orgInfo.balance
    // }

    return context
  } catch (error) {
    logger.error({ error }, 'Error getting organization context')
    return {
      usingOrganizationCredits: false,
    }
  }
}

/**
 * Displays organization context information to the user
 */
export function displayOrganizationContext(context: OrganizationContext): string {
  if (!context.usingOrganizationCredits) {
    return 'Using personal credits'
  }

  const parts = []
  
  if (context.organizationName) {
    parts.push(`Organization: ${context.organizationName}`)
  }
  
  if (context.organizationBalance !== undefined) {
    parts.push(`Org Credits: ${context.organizationBalance.toLocaleString()}`)
  }
  
  if (context.userBalance !== undefined) {
    parts.push(`Personal Credits: ${context.userBalance.toLocaleString()}`)
  }

  return parts.join(' | ')
}

/**
 * Formats credit usage information with organization context
 */
export function formatCreditUsage(
  creditsUsed: number,
  context: OrganizationContext
): string {
  const baseMessage = `Used ${creditsUsed.toLocaleString()} credits`
  
  if (context.usingOrganizationCredits && context.organizationName) {
    return `${baseMessage} (from ${context.organizationName})`
  }
  
  return `${baseMessage} (personal)`
}

/**
 * Checks if user can override organization credit usage
 */
export function canOverrideOrganizationCredits(context: OrganizationContext): boolean {
  // Users can always fall back to personal credits if they have them
  return context.userBalance !== undefined && context.userBalance > 0
}

/**
 * Gets organization-specific CLI commands
 */
export function getOrganizationCommands(): Array<{
  command: string
  description: string
  handler: () => Promise<void>
}> {
  return [
    {
      command: '/org-status',
      description: 'Show organization credit status',
      handler: async () => {
        // TODO: Implement organization status display
        console.log('Organization status not yet implemented')
      },
    },
    {
      command: '/org-switch',
      description: 'Switch between personal and organization credits',
      handler: async () => {
        // TODO: Implement organization switching
        console.log('Organization switching not yet implemented')
      },
    },
    {
      command: '/org-usage',
      description: 'Show organization usage breakdown',
      handler: async () => {
        // TODO: Implement organization usage display
        console.log('Organization usage display not yet implemented')
      },
    },
  ]
}
