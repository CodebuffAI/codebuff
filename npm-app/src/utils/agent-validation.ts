import { red, yellow } from 'picocolors'

import { websiteUrl } from '../config'
import { logger } from './logger'

/**
 * Validates agent definitions using the REST API
 * @param agentDefinitions The agent definitions to validate
 */
export async function validateAgentDefinitionsIfAuthenticated(
  agentDefinitions: any[],
): Promise<void> {
  // Only validate if there are agent configs
  if (!agentDefinitions || agentDefinitions.length === 0) {
    return
  }

  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    const response = await fetch(`${websiteUrl}/api/agents/validate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ agentDefinitions }),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage =
        (errorData as any).error ||
        `HTTP ${response.status}: ${response.statusText}`
      console.log(
        `\n${red('Agent Definition Validation Error:')} ${errorMessage}`,
      )
      return
    }

    const data = await response.json()

    if (data.validationErrors && data.validationErrors.length > 0) {
      const errorMessage = data.validationErrors
        .map((err: { filePath: string; message: string }) => err.message)
        .join('\n')
      console.log(
        `\n${yellow('Agent Definition Validation Warnings:')}\n${errorMessage}`,
      )
    }
  } catch (error) {
    logger.warn(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to validate agent definitions via REST API',
    )
  }
}
