import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import * as fs from 'fs'
import { green, red, yellow, cyan } from 'picocolors'
import { websiteUrl } from '../config'
import { logger } from '../utils/logger'
import { loadLocalAgents } from '../agents/load-agents'
import { getAgentsDirectory } from '../agents/agent-utils'
import { getUserCredentials } from '../credentials'

interface PublishResponse {
  success: boolean
  agentId?: string
  version?: string
  message?: string
  error?: string
  details?: string
  validationErrors?: Array<{
    code: string
    message: string
    path: (string | number)[]
  }>
}

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentId The id of the agent to publish (required)
 */ export async function handlePublish(agentId?: string): Promise<void> {
  const user = getUserCredentials()

  if (!user) {
    console.log(red('Please log in first using "login".'))
    return
  }

  if (!agentId) {
    console.log(red('Agent id is required. Usage: publish <agent-id>'))
    console.log(
      yellow('This prevents accidentally publishing all agents at once.')
    )

    // Show available agents
    const agentsDir = getAgentsDirectory()
    if (fs.existsSync(agentsDir)) {
      const agentTemplates = await loadLocalAgents({ verbose: false })
      if (Object.keys(agentTemplates).length > 0) {
        console.log(cyan('Available agents:'))
        Object.values(agentTemplates).forEach((template) => {
          console.log(`  - ${template.displayName} (${template.id})`)
        })
      }
    }
    return
  }

  try {
    // Load agents from .agents directory
    const agentsDir = getAgentsDirectory()

    if (!fs.existsSync(agentsDir)) {
      console.log(
        red('No .agents directory found. Create agent templates first.')
      )
      return
    }

    // Get all agent templates using existing loader
    const agentTemplates = await loadLocalAgents({ verbose: false })

    if (Object.keys(agentTemplates).length === 0) {
      console.log(red('No valid agent templates found in .agents directory.'))
      return
    }

    // Find the specific agent
    const matchingTemplate = Object.entries(agentTemplates).find(
      ([key, template]) =>
        key === agentId ||
        template.id === agentId ||
        template.displayName === agentId
    )

    if (!matchingTemplate) {
      console.log(red(`Agent "${agentId}" not found. Available agents:`))
      Object.values(agentTemplates).forEach((template) => {
        console.log(`  - ${template.displayName} (${template.id})`)
      })
      return
    }
    const [key, template] = matchingTemplate
    console.log(
      yellow(`Publishing ${template.displayName} (${template.id})...`)
    )

    try {
      const result = await publishAgentTemplate(template, user.authToken!)

      if (result.success) {
        console.log(
          green(
            `✅ Successfully published ${template.displayName} v${result.version}`
          )
        )
        console.log(cyan(`   Agent ID: ${result.agentId}`))
      } else {
        console.log(
          red(`❌ Failed to publish ${template.displayName}: ${result.error}`)
        )
      }
    } catch (error) {
      console.log(
        red(
          `❌ Error publishing ${template.displayName}: ${error instanceof Error ? error.message : String(error)}`
        )
      )
      // Avoid logger.error here as it can cause sonic boom errors that mask the real error
      // The error is already displayed to the user via console.log above
    }
  } catch (error) {
    console.log(
      red(
        `Error during publish: ${error instanceof Error ? error.message : String(error)}`
      )
    )
    // Avoid logger.error here as it can cause sonic boom errors that mask the real error
    // The error is already displayed to the user via console.log above
  }
}

/**
 * Publish an agent template to the backend
 */
async function publishAgentTemplate(
  data: DynamicAgentTemplate,
  authToken: string
): Promise<PublishResponse> {
  try {
    const response = await fetch(`${websiteUrl}/api/agents/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `next-auth.session-token=${authToken}`,
      },
      body: JSON.stringify({
        data,
      }),
    })

    let result: any
    try {
      result = await response.json()
    } catch (jsonError) {
      return {
        success: false,
        error: `Failed to parse server response: ${response.status} ${response.statusText}`,
      }
    }

    if (!response.ok) {
      // Extract detailed error information from the response
      let errorMessage =
        result.error || `HTTP ${response.status}: ${response.statusText}`

      // If there are validation details, include them
      if (result.details) {
        errorMessage += `\n\nDetails: ${result.details}`
      }

      // If there are specific validation errors, format them nicely
      if (result.validationErrors && Array.isArray(result.validationErrors)) {
        const formattedErrors = result.validationErrors
          .map((err: any) => {
            const path =
              err.path && err.path.length > 0 ? `${err.path.join('.')}: ` : ''
            return `  • ${path}${err.message}`
          })
          .join('\n')
        errorMessage += `\n\nValidation errors:\n${formattedErrors}`
      }

      return {
        success: false,
        error: errorMessage,
        details: result.details,
        validationErrors: result.validationErrors,
      }
    }

    return {
      success: true,
      agentId: result.agent?.id,
      version: result.agent?.version,
      message: result.message,
    }
  } catch (error) {
    // Handle network errors, timeouts, etc.
    if (error instanceof TypeError && error.message.includes('fetch')) {
      return {
        success: false,
        error: `Network error: Unable to connect to ${websiteUrl}. Please check your internet connection and try again.`,
      }
    }

    return {
      success: false,
      error: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}
