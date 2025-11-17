import { validateAgents as validateAgentsSDK } from '@codebuff/sdk'
import type { AgentDefinition } from '@codebuff/sdk'

export type ValidationResult = {
  success: boolean
  validationErrors: Array<{ id: string; message: string }>
  networkError: string | null
}

/**
 * Wrapper around SDK's validateAgents that cleanly handles network errors.
 * Network errors are separated from validation errors for cleaner handling.
 */
export async function validateAgentsWithNetworkHandling(
  agentDefinitions: AgentDefinition[],
  options?: { remote?: boolean }
): Promise<ValidationResult> {
  try {
    const result = await validateAgentsSDK(agentDefinitions, options)

    return {
      success: result.success,
      validationErrors: result.validationErrors,
      networkError: null,
    }
  } catch (error: any) {
    // Handle network errors separately
    if (error?.code === 'NETWORK_ERROR') {
      return {
        success: true, // Don't block on network errors
        validationErrors: [],
        networkError: error.message || 'Unable to connect to validation server',
      }
    }

    // Re-throw unexpected errors
    throw error
  }
}