import { useMutation } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'

import { usePublishStore } from '../state/publish-store'

export interface PublishResult {
  success: boolean
  publisherId?: string
  agents?: Array<{
    id: string
    version: string
    displayName: string
  }>
  error?: string
  details?: string
  hint?: string
}

// Query keys for type-safe cache management
export const publishQueryKeys = {
  all: ['publish'] as const,
}

async function handlePublish(_agentIds: string[]): Promise<PublishResult> {
  return {
    success: false,
    error: 'Agent publishing is disabled in Openbuff local mode.',
  }
}

export interface UsePublishMutationDeps {
  handlePublish?: (agentIds: string[]) => Promise<PublishResult>
}

/**
 * Hook for publishing agents to the agent store
 * Uses TanStack Query mutation for proper state management
 */
export function usePublishMutation(deps: UsePublishMutationDeps = {}) {
  const { handlePublish: customPublish = handlePublish } = deps

  const { setIsPublishing, setSuccessResult, setErrorResult } = usePublishStore(
    useShallow((state) => ({
      setIsPublishing: state.setIsPublishing,
      setSuccessResult: state.setSuccessResult,
      setErrorResult: state.setErrorResult,
    })),
  )

  return useMutation({
    mutationFn: async (agentIds: string[]) => {
      setIsPublishing(true)
      return customPublish(agentIds)
    },
    onSuccess: (result) => {
      if (result.success && result.publisherId && result.agents) {
        setSuccessResult({
          publisherId: result.publisherId,
          agents: result.agents,
        })
      } else {
        setErrorResult({
          error: result.error || 'Unknown error',
          details: result.details,
          hint: result.hint,
        })
      }
    },
    onError: (error) => {
      setErrorResult({
        error: 'Publish failed',
        details: error instanceof Error ? error.message : String(error),
      })
    },
  })
}
