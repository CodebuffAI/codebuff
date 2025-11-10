import { useMemo } from 'react'

import type { ChatMessage } from '../types/chat'

const MAX_VIRTUALIZED_TOP_LEVEL = 60
const VIRTUAL_OVERSCAN = 12

interface UseMessageVirtualizationOptions {
  topLevelMessages: ChatMessage[]
  isAtBottom: boolean
}

export const useMessageVirtualization = ({
  topLevelMessages,
  isAtBottom,
}: UseMessageVirtualizationOptions) => {
  const shouldVirtualize =
    isAtBottom && topLevelMessages.length > MAX_VIRTUALIZED_TOP_LEVEL

  const virtualTopLevelMessages = useMemo(() => {
    if (!shouldVirtualize) {
      return topLevelMessages
    }
    const windowSize = MAX_VIRTUALIZED_TOP_LEVEL + VIRTUAL_OVERSCAN
    const sliceStart = Math.max(0, topLevelMessages.length - windowSize)
    return topLevelMessages.slice(sliceStart)
  }, [shouldVirtualize, topLevelMessages])

  const hiddenTopLevelCount = Math.max(
    0,
    topLevelMessages.length - virtualTopLevelMessages.length,
  )

  return {
    shouldVirtualize,
    virtualTopLevelMessages,
    hiddenTopLevelCount,
  }
}
