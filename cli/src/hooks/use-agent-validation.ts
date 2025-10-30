import { useCallback, useState } from 'react'

import { validateAgents } from '@codebuff/sdk'

import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { logger } from '../utils/logger'

export type ValidationError = {
  id: string
  message: string
}

type UseAgentValidationResult = {
  validationErrors: ValidationError[]
  isValidating: boolean
  validate: () => Promise<boolean>
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
  // Returns true if validation passes, false if it fails
  const validate = useCallback(async (): Promise<boolean> => {
    setIsValidating(true)

    try {
      const agentDefinitions = loadAgentDefinitions()
      logger.debug(
        { agentCount: agentDefinitions.length },
        'Validating agents before message send...',
      )

      const validationResult = await validateAgents(agentDefinitions, {
        remote: false, // Use local validation for speed, avoid network calls
      })

      if (validationResult.success) {
        logger.debug('Agent validation passed')
        setValidationErrors([])
        return true
      } else {
        logger.debug(
          { errorCount: validationResult.validationErrors.length },
          'Agent validation found errors',
        )
        setValidationErrors(validationResult.validationErrors)
        return false
      }
    } catch (error) {
      logger.error({ error }, 'Agent validation failed with exception')
      // Don't update validation errors on exception - keep previous state
      // Return false to block message sending on validation errors
      return false
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
