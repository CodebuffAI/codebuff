import {
  validateAgents as validateAgentsCommon,
  type DynamicAgentValidationError,
} from '@codebuff/common/templates/agent-validation'
import type { AgentDefinition } from '@codebuff/common/templates/initial-agents-dir/types/agent-definition'
import { WEBSITE_URL } from './constants'
import { NetworkError, isNetworkError } from './errors'
import { failure, type ErrorOr } from '@codebuff/common/util/error'

export interface ValidationResult {
  success: boolean
  validationErrors: Array<{
    id: string
    message: string
  }>
  errorCount: number
}

export interface ValidateAgentsOptions {
  /**
   * Whether to perform remote validation via the web API.
   * Remote validation checks spawnable agents against the database.
   */
  remote?: boolean

  /**
   * The base URL of the Codebuff website API.
   * Optional - defaults to NEXT_PUBLIC_CODEBUFF_APP_URL or environment-based URL.
   * Example: 'https://codebuff.com'
   */
  websiteUrl?: string
}

function buildValidationApiNetworkError(params: {
  message: string
  status?: number
  original?: unknown
}): NetworkError {
  // For 5xx errors, use "Server error" prefix to match test expectations
  // For network failures, use "Failed to connect" prefix
  const prefix = params.status && params.status >= 500 ? 'Server error' : 'Failed to connect to validation API'
  const baseMessage = `${prefix}: ${params.message}`
  const wrapped = new NetworkError(baseMessage, {
    status: params.status,
    originalError: params.original,
  })
  return wrapped
}

/**
 * Validates an array of agent definitions.
 *
 * By default, performs local Zod schema validation.
 * When `options.remote` is true, additionally validates spawnable agents via the web API.
 *
 * @param definitions - Array of agent definitions to validate
 * @param options - Optional configuration for validation
 * @returns Promise<ValidationResult> - Validation results with any errors
 *
 * @example
 * ```typescript
 * // Local validation only
 * const result = await validateAgents(definitions)
 *
 * // Remote validation
 * const result = await validateAgents(definitions, {
 *   remote: true,
 *   websiteUrl: 'https://codebuff.com'
 * })
 * ```
 */
export type ValidateAgentsResult = ErrorOr<ValidationResult>

export async function validateAgents(
  definitions: AgentDefinition[],
  options?: ValidateAgentsOptions,
): Promise<ValidateAgentsResult> {
  // Convert array of definitions to Record<string, AgentDefinition> format
  // that the common validation functions expect
  // Use index as key to preserve all entries (including duplicates)
  const agentTemplates: Record<string, AgentDefinition> = {}
  for (const [index, definition] of definitions.entries()) {
    // Handle null/undefined gracefully
    if (!definition) {
      agentTemplates[`agent_${index}`] = definition as AgentDefinition
      continue
    }
    // Use index to ensure duplicates aren't overwritten
    const key = definition.id ? `${definition.id}_${index}` : `agent_${index}`
    agentTemplates[key] = definition
  }

  // Simple logger implementation for common validation functions
  const logger = {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }

  let validationErrors: DynamicAgentValidationError[] = []

  if (options?.remote) {
    // Remote validation: call the web API
    // Use provided websiteUrl or fall back to the default from environment
    const websiteUrl = options.websiteUrl || WEBSITE_URL

    try {
      const response = await fetch(`${websiteUrl}/api/agents/validate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ agentDefinitions: definitions }),
      })

      if (!response.ok) {
        let errorData: any = {}
        try {
          errorData = await response.json()
        } catch {
          // ignore JSON parse errors, we'll fall back to status text
        }
        const errorMessage =
          (errorData as any).error ||
          `HTTP ${response.status}: ${response.statusText}`

        // For 5xx errors, throw a NetworkError with original error metadata
        if (response.status >= 500) {
          const original = {
            status: response.status,
            statusText: response.statusText,
            body: errorData,
          }
          throw buildValidationApiNetworkError({
            message: errorMessage,
            status: response.status,
            original,
          })
        }

        // For client errors (4xx), return as validation errors wrapped in ErrorOr success
        const validationResult: ValidationResult = {
          success: false,
          validationErrors: [
            {
              id: 'validation_api_error',
              message: `Validation error: ${errorMessage}`,
            },
          ],
          errorCount: 1,
        }
        return {
          success: true,
          value: validationResult,
        }
      }

      const data = await response.json()
      validationErrors = data.validationErrors || []
    } catch (error) {
      if (isNetworkError(error)) {
        return failure(error)
      }

      const message = error instanceof Error ? error.message : String(error)

      // Wrap all network failures in a NetworkError that includes the original error
      const networkError = buildValidationApiNetworkError({
        message,
        original: error,
      })
      return failure(networkError)
    }
  } else {
    // Local validation: use common package validation logic
    const result = validateAgentsCommon({
      agentTemplates,
      logger,
    })

    validationErrors = result.validationErrors
  }

  // Transform validation errors to the SDK format
  const transformedErrors = validationErrors.map((error) => ({
    id: error.filePath,
    message: error.message,
  }))

  const result: ValidationResult = {
    success: transformedErrors.length === 0,
    validationErrors: transformedErrors,
    errorCount: transformedErrors.length,
  }

  return {
    success: true,
    value: result,
  }
}
