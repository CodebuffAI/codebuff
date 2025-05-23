import { logger } from './utils/logger'
import { getProjectRoot, getCurrentRepositoryUrl } from './project-files'
import { Client } from './client'

export interface OrganizationContext {
  currentOrganization?: {
    id: string
    name: string
    creditBalance: number
  }
  repositoryOrganization?: {
    id: string
    name: string
  }
  fallbackToPersonal: boolean
  repositoryUrl?: string
  usingOrganizationCredits: boolean
  organizationBalance?: number
  userBalance?: number
}

export class OrganizationContextManager {
  private context: OrganizationContext = { 
    fallbackToPersonal: true,
    usingOrganizationCredits: false
  }

  async updateContextForRepository(repositoryUrl: string): Promise<void> {
    try {
      this.context.repositoryUrl = repositoryUrl

      // Call backend to determine organization for this repo
      const response = await fetch('/api/user/repository-organization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ repositoryUrl })
      })

      if (response.ok) {
        const { organization } = await response.json()
        if (organization) {
          this.context.repositoryOrganization = organization
          this.context.usingOrganizationCredits = true
          this.context.fallbackToPersonal = false
        } else {
          this.context.repositoryOrganization = undefined
          this.context.usingOrganizationCredits = false
          this.context.fallbackToPersonal = true
        }
      } else {
        // API call failed, fall back to personal
        this.context.repositoryOrganization = undefined
        this.context.usingOrganizationCredits = false
        this.context.fallbackToPersonal = true
      }
    } catch (error) {
      logger.error({ error }, 'Error updating organization context')
      this.context.repositoryOrganization = undefined
      this.context.usingOrganizationCredits = false
      this.context.fallbackToPersonal = true
    }
  }

  getDisplayMessage(): string {
    if (this.context.repositoryOrganization) {
      return `Credits will be charged to ${this.context.repositoryOrganization.name}`
    }
    return 'Credits will be charged to your personal account'
  }

  getContext(): OrganizationContext {
    return { ...this.context }
  }
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
        fallbackToPersonal: true,
      }
    }

    // Check if this repository is associated with an organization
    // This would typically be done via an API call to the backend
    // For now, we'll implement a placeholder
    
    const context: OrganizationContext = {
      repositoryUrl,
      usingOrganizationCredits: false,
      fallbackToPersonal: true,
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
      fallbackToPersonal: true,
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
  
  if (context.repositoryOrganization?.name) {
    parts.push(`Organization: ${context.repositoryOrganization.name}`)
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
  
  if (context.usingOrganizationCredits && context.repositoryOrganization?.name) {
    return `${baseMessage} (from ${context.repositoryOrganization.name})`
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
