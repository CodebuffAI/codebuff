import { useState, useRef, useCallback, useEffect } from 'react'

import { validateAgentsWithNetworkHandling } from '../utils/validate-agents-wrapper'
import { loadAgentDefinitions } from '../utils/load-agent-definitions'
import { logger } from '../utils/logger'

type LoadedAgentsData = {
  agents: Array<{ id: string; displayName: string }>
  agentsDir: string
} | null

type UseValidationStateOptions = {
  loadedAgentsData: LoadedAgentsData
  initialValidationErrors: Array<{ id: string; message: string }>
  initialValidationNetworkError: string | null
  retryIntervalMs?: number
}

export function useValidationState({
  loadedAgentsData,
  initialValidationErrors,
  initialValidationNetworkError,
  retryIntervalMs = 5000,
}: UseValidationStateOptions) {
  const [validationErrors, setValidationErrors] = useState(
    initialValidationErrors,
  )
  const [validationNetworkError, setValidationNetworkError] = useState(
    initialValidationNetworkError,
  )
  const isValidationInFlight = useRef(false)

  const refreshValidationState = useCallback(async () => {
    if (!loadedAgentsData || isValidationInFlight.current) {
      return
    }

    isValidationInFlight.current = true
    try {
      const agentDefinitions = loadAgentDefinitions()
      const validationResult = await validateAgentsWithNetworkHandling(
        agentDefinitions,
        { remote: true },
      )

      setValidationErrors(validationResult.validationErrors)
      setValidationNetworkError(validationResult.networkError)
    } catch (error) {
      logger.warn(
        {
          error: error instanceof Error ? error.message : String(error),
        },
        'Agent validation retry failed',
      )
    } finally {
      isValidationInFlight.current = false
    }
  }, [loadedAgentsData])

  useEffect(() => {
    if (!loadedAgentsData || !validationNetworkError) {
      return
    }

    const interval = setInterval(() => {
      void refreshValidationState()
    }, retryIntervalMs)

    return () => clearInterval(interval)
  }, [
    loadedAgentsData,
    validationNetworkError,
    refreshValidationState,
    retryIntervalMs,
  ])

  return {
    validationErrors,
    validationNetworkError,
    refreshValidationState,
  }
}
