import React from 'react'

import { BottomBanner } from './bottom-banner'
import { useChatStore } from '../state/chat-store'

const HELP_TIMEOUT = 30 * 1000 // 30 seconds

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
      text="Shortcuts: /commands • Ctrl+C stop • Ctrl+J or Option+Enter newline • @files/agents • ↑↓ history • !bash"
      onClose={() => setInputMode('default')}
    />
  )
}
