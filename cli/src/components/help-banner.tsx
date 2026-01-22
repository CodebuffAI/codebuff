import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useChatStore } from '../state/chat-store'

const HELP_TIMEOUT = 60 * 1000 // 60 seconds

/** Help banner showing keyboard shortcuts and tips. */
export const HelpBanner = () => {
  const setInputMode = useChatStore((state) => state.setInputMode)

  // Auto-hide after timeout
  React.useEffect(() => {
    const timer = setTimeout(() => {
      setInputMode('default')
    }, HELP_TIMEOUT)
    return () => clearTimeout(timer)
  }, [setInputMode])

  return (
    <BottomBanner
      borderColorKey="info"
      text={`Shortcuts: /commands • Ctrl+C stop • Ctrl+J or Option+Enter newline • @files/agents • ↑↓ history • !bash commands

1 credit = 1 cent. Buy more with /buy-credits. Earn more from ads. Connect your Claude Subscription to pay for Claude models (Default and Max modes).`}
      onClose={() => setInputMode('default')}
    />
  )
}
