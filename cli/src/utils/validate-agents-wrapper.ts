import { validateAgents as validateAgentsSDK, isNetworkError } from '@codebuff/sdk'
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
    if (!result.success) {
      throw result.error
    }

    const { success: validationSucceeded, validationErrors } = result.value

    return {
      success: validationSucceeded,
      validationErrors,
      networkError: null,
    }
  } catch (error) {
    // Handle network errors separately
    if (isNetworkError(error)) {
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
