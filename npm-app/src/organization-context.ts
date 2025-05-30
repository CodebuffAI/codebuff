import { logger } from './utils/logger'
import { backendUrl } from './config'
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
    creditBalance?: number
  }
  fallbackToPersonal: boolean
  repositoryUrl?: string
  usingOrganizationCredits: boolean
  organizationBalance?: number
  userBalance?: number
}

export class OrganizationContextManager {
  public context: OrganizationContext = {
    fallbackToPersonal: true,
    usingOrganizationCredits: false,
  }

  private hasShownOrganizationMessage = false

  /**
   * Calls the backend API to check organization for repository and saves the result
   */
  async checkAndSaveOrganizationForRepository(
    repositoryUrl: string,
    fingerprintId: string,
    authToken?: string
  ): Promise<void> {
    try {
      // Call backend to determine organization for this repo
      const response = await fetch(
        `${backendUrl}/api/repository-organization`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fingerprintId,
            authToken,
            repositoryUrl,
          }),
        }
      )

      if (response.ok) {
        const { organization } = await response.json()
        if (organization) {
          this.context.repositoryOrganization = organization
          this.context.usingOrganizationCredits = true
          this.context.fallbackToPersonal = false

          logger.info(
            {
              repositoryUrl,
              organizationId: organization.id,
              organizationName: organization.name,
            },
            'Repository is associated with organization'
          )
        } else {
          this.context.repositoryOrganization = undefined
          this.context.usingOrganizationCredits = false
          this.context.fallbackToPersonal = true
        }
      } else {
        // API call failed, fall back to personal
        logger.warn(
          { status: response.status },
          'Failed to check organization for repository'
        )
        this.context.repositoryOrganization = undefined
        this.context.usingOrganizationCredits = false
        this.context.fallbackToPersonal = true
      }
    } catch (error) {
      logger.error({ error }, 'Error checking organization for repository')
      this.context.repositoryOrganization = undefined
      this.context.usingOrganizationCredits = false
      this.context.fallbackToPersonal = true
    }
  }

  async updateContextForRepository(
    repositoryUrl: string,
    authToken?: string
  ): Promise<void> {
    try {
      this.context.repositoryUrl = repositoryUrl

      // Get fingerprint ID from client - use dynamic import to avoid circular dependency
      let fingerprintId: string | undefined
      const client = Client.getInstance()
      fingerprintId = await client.fingerprintId

      if (!fingerprintId) {
        logger.warn(
          'No fingerprint ID available for organization context update'
        )
        this.context.repositoryOrganization = undefined
        this.context.usingOrganizationCredits = false
        this.context.fallbackToPersonal = true
        return
      }

      await this.checkAndSaveOrganizationForRepository(
        repositoryUrl,
        fingerprintId,
        authToken
      )
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

  getBillingContextMessage(): string {
    // Don't show the message anymore since it's shown once at startup
    return ''
  }

  getInitialOrganizationMessage(): string | null {
    if (
      this.context.repositoryOrganization &&
      !this.hasShownOrganizationMessage
    ) {
      this.hasShownOrganizationMessage = true
      return `🏢 Using credits from ${this.context.repositoryOrganization.name}`
    }
    return null
  }
  

  getPromptIndicator(): string {
    if (this.context.repositoryOrganization) {
      return ` (${this.context.repositoryOrganization.name})`
    }
    return ''
  }

  getContext(): OrganizationContext {
    return { ...this.context }
  }

  isOrganizationContext(): boolean {
    return (
      this.context.usingOrganizationCredits &&
      !!this.context.repositoryOrganization
    )
  }

  getOrganizationId(): string | undefined {
    return this.context.repositoryOrganization?.id
  }

  getOrganizationName(): string | undefined {
    return this.context.repositoryOrganization?.name
  }

  reset(): void {
    this.context = {
      fallbackToPersonal: true,
      usingOrganizationCredits: false,
    }
    this.hasShownOrganizationMessage = false
  }
}

/**
 * Formats credit usage information with organization context
 */
export function formatCreditUsage(
  creditsUsed: number,
  context: OrganizationContext
): string {
  const baseMessage = `Used ${creditsUsed.toLocaleString()} credits`

  if (
    context.usingOrganizationCredits &&
    context.repositoryOrganization?.name
  ) {
    return `${baseMessage} (from ${context.repositoryOrganization.name})`
  }

  return `${baseMessage} (personal)`
}
