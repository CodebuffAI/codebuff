import { useCallback, useState } from 'react'

import { validateAgents } from '@codebuff/sdk'

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

      const validationResult = await validateAgents(agentDefinitions, {
        remote: true,
      })

      if (validationResult.success) {
        setValidationErrors([])
        return { success: true, errors: [] }
      } else {
        // Filter out network_error - it's handled separately by the auth system
        const filteredErrors = validationResult.validationErrors.filter(
          (error) => error.id !== 'network_error'
        )

        if (filteredErrors.length > 0) {
          setValidationErrors(filteredErrors)
          return { success: false, errors: filteredErrors }
        } else {
          // If only network errors, don't block sending messages
          // The network error is already handled by the auth system
          setValidationErrors([])
          return { success: true, errors: [] }
        }
      }
    } catch (error) {
      logger.error({ error }, 'Agent validation failed with exception')
      // Don't update validation errors on exception - keep previous state
      // Return failure to block message sending on validation errors
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
