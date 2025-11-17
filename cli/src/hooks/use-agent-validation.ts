import { useCallback, useState } from 'react'

import { validateAgentsWithNetworkHandling } from '../utils/validate-agents-wrapper'

import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { logger } from '../utils/logger'

export type ValidationError = {
  id: string
  message: string
}

export type ValidationCheckResult = {
  success: boolean
  errors: ValidationError[]
}

type UseAgentValidationResult = {
  validationErrors: ValidationError[]
  isValidating: boolean
  validate: () => Promise<ValidationCheckResult>
}

/**
 * Hook that provides agent validation functionality.
 * Call validate() manually to trigger validation (e.g., on message send).
 */
export const useAgentValidation = (
  initialErrors: ValidationError[] = [],
): UseAgentValidationResult => {
  const [validationErrors, setValidationErrors] =
    useState<ValidationError[]>(initialErrors)
  const [isValidating, setIsValidating] = useState(false)

  // Validate agents and update state
  // Returns validation result with success status and any errors
  const validate = useCallback(async (): Promise<ValidationCheckResult> => {
    setIsValidating(true)

    try {
      const agentDefinitions = loadAgentDefinitions()

      const validationResult = await validateAgentsWithNetworkHandling(
        agentDefinitions,
        { remote: true }
      )

      setValidationErrors(validationResult.validationErrors)

      // Network errors are handled separately and don't block message sending
      return {
        success: validationResult.success || validationResult.networkError !== null,
        errors: validationResult.validationErrors,
      }
    } catch (error) {
      logger.error({ error }, 'Agent validation failed with exception')
      // Don't update validation errors on exception - keep previous state
      return { success: false, errors: [] }
    } finally {
      setIsValidating(false)
    }
  }, [])

  return {
    validationErrors,
    isValidating,
    validate,
  }
}
