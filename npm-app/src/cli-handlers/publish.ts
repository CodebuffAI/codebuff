import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import * as fs from 'fs'
import { green, red, yellow, cyan } from 'picocolors'
import { Client } from '../client'
import { backendUrl } from '../config'
import { logger } from '../utils/logger'
import { loadLocalAgents } from '../agents/load-agents'
import { getAgentsDirectory } from '../agents/agent-utils'

interface PublishResponse {
  success: boolean
  agentId?: string
  version?: string
  message?: string
  error?: string
}

/**
 * Handle the publish command to upload agent templates to the backend
 * @param agentName The name of the agent to publish (required)
 */
export async function handlePublish(agentName?: string): Promise<void> {
  const client = Client.getInstance()

  if (!client.user) {
    console.log(red('Please log in first using "login".'))
    return
  }

  if (!agentName) {
    console.log(red('Agent name is required. Usage: publish <agent-name>'))
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
        key === agentName ||
        template.id === agentName ||
        template.displayName === agentName
    )

    if (!matchingTemplate) {
      console.log(red(`Agent "${agentName}" not found. Available agents:`))
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
      const result = await publishAgentTemplate(
        template,
        client.user.authToken!
      )

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
      logger.error(
        {
          error: error instanceof Error ? error.message : String(error),
          agentId: template.id,
        },
        'Error publishing agent template'
      )
    }
  } catch (error) {
    console.log(
      red(
        `Error during publish: ${error instanceof Error ? error.message : String(error)}`
      )
    )
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
      },
      'Error during publish command'
    )
  }
}

/**
 * Publish an agent template to the backend
 */
async function publishAgentTemplate(
  template: DynamicAgentTemplate,
  authToken: string
): Promise<PublishResponse> {
  try {
    const response = await fetch(`${backendUrl}/api/agents/publish`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({
        template,
      }),
    })

    const result = await response.json()

    if (!response.ok) {
      return {
        success: false,
        error:
          result.error || `HTTP ${response.status}: ${response.statusText}`,
      }
    }

    return {
      success: true,
      agentId: result.agent?.id,
      version: result.agent?.version,
      message: result.message,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
