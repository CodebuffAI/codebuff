import { WEBSITE_URL } from '@codebuff/sdk'
import { cyan, green, red, yellow } from 'picocolors'

import { getUserCredentials } from '../utils/auth'
import { getApiClient, setApiClientAuthToken } from '../utils/codebuff-api'
import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { getLoadedAgentsData } from '../utils/local-agent-registry'

import type {
  PublishAgentsErrorResponse,
  PublishAgentsResponse,
} from '@codebuff/common/types/api/agents/publish'

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
 */
export async function handlePublish(agentIds: string[]): Promise<void> {
  const user = getUserCredentials()

  if (!user) {
    console.log(red('Please log in first using "login" command or web UI.'))
    return
  }

  const availableAgents = getLoadedAgentsData()?.agents || []

  if (agentIds?.length === 0) {
    console.log(
      red('Agent id is required. Usage: publish <agent-id> [agent-id2] ...'),
    )

    // Show available agents
    if (availableAgents.length > 0) {
      console.log(cyan('Available agents:'))
      availableAgents.forEach((agent) => {
        const identifier =
          agent.displayName && agent.displayName !== agent.id
            ? `${agent.displayName} (${agent.id})`
            : agent.displayName || agent.id
        console.log(`  - ${identifier}`)
      })
    }
    return
  }

  try {
    const loadedDefinitions = loadAgentDefinitions()

    if (loadedDefinitions.length === 0) {
      console.log(red('No valid agent templates found in .agents directory.'))
      return
    }

    const matchingTemplates: Record<string, any> = {}

    for (const agentId of agentIds) {
      // Find the specific agent
      const matchingTemplate = loadedDefinitions.find(
        (template) =>
          template.id === agentId || (template as any).displayName === agentId,
      )

      if (!matchingTemplate) {
        console.log(red(`Agent "${agentId}" not found. Available agents:`))
        availableAgents.forEach((agent) => {
          const identifier =
            agent.displayName && agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName || agent.id
          console.log(`  - ${identifier}`)
        })
        return
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

    console.log(yellow(`Publishing:`))
    for (const template of Object.values(matchingTemplates)) {
      const displayName = (template as any).displayName || template.id
      console.log(`  - ${displayName} (${template.id})`)
    }

    const result = await publishAgentTemplates(
      Object.values(matchingTemplates),
      user.authToken!,
    )

    if (result.success) {
      console.log(green(`✅ Successfully published:`))
      for (const agent of result.agents) {
        console.log(
          cyan(
            `  - ${agent.displayName} (${result.publisherId}/${agent.id}@${agent.version})`,
          ),
        )
      }
      return
    }

    console.log(red(`❌ Failed to publish your agents`))
    if (result.error) console.log(red(`Error: ${result.error}`))
    if (result.details) console.log(red(`\n${result.details}`))
    if (result.hint) console.log(yellow(`\nHint: ${result.hint}`))

    // Show helpful guidance based on error type
    if (result.error?.includes('Publisher field required')) {
      console.log()
      console.log(cyan('Add a "publisher" field to your agent templates:'))
      console.log(yellow('  "publisher": "<publisher-id>"'))
      console.log()
    } else if (
      result.error?.includes('Publisher not found or not accessible')
    ) {
      console.log()
      console.log(
        cyan(
          'Check that the publisher ID is correct and you have access to it.',
        ),
      )
      console.log()
    }

    console.log(cyan('Visit the website to manage your publishers:'))
    console.log(yellow(`${WEBSITE_URL}/publishers`))
  } catch (error) {
    console.log(
      red(
        `Error during publish: ${error instanceof Error ? error.message + '\n' + error.stack : String(error)}`,
      ),
    )
  }
}
