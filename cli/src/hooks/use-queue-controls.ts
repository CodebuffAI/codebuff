import { useCallback } from 'react'

interface UseQueueControlsParams {
  queuePaused: boolean
  queuedCount: number
  clearQueue: () => string[]
  resumeQueue: () => void
  baseHandleCtrlC: () => true
}

export const useQueueControls = ({
  queuePaused,
  queuedCount,
  clearQueue,
  resumeQueue,
  baseHandleCtrlC,
}: UseQueueControlsParams) => {
  const handleCtrlC = useCallback(() => {
    if (queuePaused && queuedCount > 0) {
      clearQueue()
      resumeQueue()
      return true
    }
    return baseHandleCtrlC()
  }, [baseHandleCtrlC, clearQueue, queuePaused, queuedCount, resumeQueue])

  const ensureQueueActiveBeforeSubmit = useCallback(() => {
    if (queuePaused) {
      resumeQueue()
      return true
    }
    return false
  }, [queuePaused, resumeQueue])

  return { handleCtrlC, ensureQueueActiveBeforeSubmit }
}
