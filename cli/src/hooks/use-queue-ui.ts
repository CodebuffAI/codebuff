import { useMemo } from 'react'

import { pluralize } from '@codebuff/common/util/string'

import { formatQueuedPreview } from '../utils/helpers'

interface UseQueueUiParams {
  queuePaused: boolean
  queuedMessages: string[]
  separatorWidth: number
  terminalWidth: number
}

export const useQueueUi = ({
  queuePaused,
  queuedMessages,
  separatorWidth,
  terminalWidth,
}: UseQueueUiParams) => {
  const queuedCount = queuedMessages.length
  const shouldShowQueuePreview = queuedCount > 0 && !queuePaused

  const queuePreviewTitle = useMemo(() => {
    if (!shouldShowQueuePreview) return undefined
    const previewWidth = Math.max(30, separatorWidth - 20)
    return formatQueuedPreview(queuedMessages, previewWidth)
  }, [shouldShowQueuePreview, queuedMessages, separatorWidth])

  const pausedQueueText = useMemo(() => {
    if (!queuePaused || queuedCount === 0) return undefined
    return `${pluralize(queuedCount, 'message')} queued — your message sends first`
  }, [queuePaused, queuedCount])

  const inputPlaceholder = useMemo(() => {
    const base =
      terminalWidth < 65
        ? 'Enter a coding task'
        : 'Enter a coding task or / for commands'

    if (queuePaused && queuedCount > 0) {
      return 'Queue paused — your next message sends first (Ctrl-C cancels)'
    }

    return base
  }, [queuePaused, queuedCount, terminalWidth])

  return {
    queuedCount,
    shouldShowQueuePreview,
    queuePreviewTitle,
    pausedQueueText,
    inputPlaceholder,
  }
}
