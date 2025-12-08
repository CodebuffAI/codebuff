import { WEBSITE_URL } from '@codebuff/sdk'

import { getUserCredentials } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { loadAgentDefinitions, getLoadedAgentsData } from '../utils/local-agent-registry'

import type {
  PublishAgentsErrorResponse,
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'

export interface PublishResult {
  success: boolean
  publisherId?: string
  agents?: Array<{
    id: string
    version: string
    displayName: string
  }>
  error?: string
  details?: string
  hint?: string
}

/**
 * Publish agent templates to the backend
 */
async function publishAgentTemplates(
  data: Record<string, any>[],
  authToken: string,
): Promise<PublishAgentsResponse & { statusCode?: number }> {
  setApiClientAuthToken(authToken)
  const apiClient = getApiClient()

  try {
    const response = await apiClient.publish(data)

    if (!response.ok) {
      // Try to use the full error data if available (includes details, hint, etc.)
      const errorData = response.errorData as
        | Partial<PublishAgentsErrorResponse>
        | undefined
      return {
        success: false,
        error: errorData?.error ?? response.error ?? 'Unknown error',
        details: errorData?.details,
        hint: errorData?.hint,
        availablePublishers: errorData?.availablePublishers,
        validationErrors: errorData?.validationErrors,
        statusCode: response.status,
      }
    }

    // Guard against empty/undefined response data
    if (!response.data) {
      return {
        success: false,
        error: 'Failed to parse server response - empty response body',
        statusCode: response.status,
      }
    }

    return {
      ...response.data,
      statusCode: response.status,
    }
  } catch (err: any) {
    if (err instanceof TypeError && err.message.includes('fetch')) {
      return {
        success: false,
        error: `Network error: Unable to connect to ${WEBSITE_URL}. Please check your internet connection and try again.`,
      }
    }

    const body = err?.responseBody || err?.body || err
    const error = body?.error || body?.message || 'Failed to publish'
    const details = body?.details
    const hint = body?.hint

    return {
      success: false,
      error,
      details,
      hint,
    }
  }
}

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentIds The ids or display names of the agents to publish
 * @returns PublishResult with success/error information
 */
export async function handlePublish(agentIds: string[]): Promise<PublishResult> {
  const user = getUserCredentials()

  if (!user) {
    return {
      success: false,
      error: 'Not logged in',
      hint: 'Please log in first using "login" command or web UI.',
    }
  }

  const availableAgents = getLoadedAgentsData()?.agents || []

  if (agentIds?.length === 0) {
    return {
      success: false,
      error: 'No agents specified',
      hint: 'Usage: publish <agent-id> [agent-id2] ...',
    }
  }

  try {
    const loadedDefinitions = loadAgentDefinitions()

    if (loadedDefinitions.length === 0) {
      return {
        success: false,
        error: 'No valid agent templates found in .agents directory.',
      }
    }

    const matchingTemplates: Record<string, any> = {}

    for (const agentId of agentIds) {
      // Find the specific agent
      const matchingTemplate = loadedDefinitions.find(
        (template) =>
          template.id === agentId || (template as any).displayName === agentId,
      )

      if (!matchingTemplate) {
        const availableList = availableAgents
          .map((agent) =>
            agent.displayName && agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName || agent.id,
          )
          .join(', ')
        return {
          success: false,
          error: `Agent "${agentId}" not found`,
          details: `Available agents: ${availableList}`,
        }
      }

      // Process the template for publishing
      const processedTemplate = { ...matchingTemplate }

      // Convert handleSteps function to string if present
      if (typeof (matchingTemplate as any).handleSteps === 'function') {
        ;(processedTemplate as any).handleSteps = (
          matchingTemplate as any
        ).handleSteps.toString()
      }

      matchingTemplates[matchingTemplate.id] = processedTemplate
    }

    const result = await publishAgentTemplates(
      Object.values(matchingTemplates),
      user.authToken!,
    )

    if (result.success) {
      return {
        success: true,
        publisherId: result.publisherId,
        agents: result.agents,
      }
    }

    // Build error result
    let hint = result.hint
    if (result.error?.includes('Publisher field required')) {
      hint = 'Add a "publisher" field to your agent templates.'
    } else if (result.error?.includes('Publisher not found or not accessible')) {
      hint = `Check that the publisher ID is correct and you have access to it. Visit ${WEBSITE_URL}/publishers to manage publishers.`
    }

    return {
      success: false,
      error: result.error,
      details: result.details,
      hint,
    }
  } catch (error) {
    return {
      success: false,
      error: 'Publish failed',
      details: error instanceof Error ? error.message : String(error),
    }
  }
}
