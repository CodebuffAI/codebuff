import { useCallback } from 'react'

interface UseQueueControlsParams {
  queuePaused: boolean
  queuedCount: number
  clearQueue: () => string[]
  resumeQueue: () => void
  inputHasText: boolean
  baseHandleCtrlC: () => true
}

type QueueCtrlCHandlerOptions = UseQueueControlsParams

export const createQueueCtrlCHandler = ({
  queuePaused,
  queuedCount,
  clearQueue,
  resumeQueue,
  inputHasText,
  baseHandleCtrlC,
}: QueueCtrlCHandlerOptions) => () => {
  if (queuePaused && queuedCount > 0 && !inputHasText) {
    clearQueue()
    resumeQueue()
    return true
  }
  return baseHandleCtrlC()
}

export const useQueueControls = ({
  queuePaused,
  queuedCount,
  clearQueue,
  resumeQueue,
  inputHasText,
  baseHandleCtrlC,
}: UseQueueControlsParams) => {
  const handleCtrlC = useCallback(
    createQueueCtrlCHandler({
      queuePaused,
      queuedCount,
      clearQueue,
      resumeQueue,
      inputHasText,
      baseHandleCtrlC,
    }),
    [
      baseHandleCtrlC,
      clearQueue,
      inputHasText,
      queuePaused,
      queuedCount,
      resumeQueue,
    ],
  )

  const ensureQueueActiveBeforeSubmit = useCallback(() => {
    if (queuePaused) {
      resumeQueue()
      return true
    }
    return false
  }, [queuePaused, resumeQueue])

  return { handleCtrlC, ensureQueueActiveBeforeSubmit }
}
