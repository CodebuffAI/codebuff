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
      text="Shortcuts: Ctrl+C stop • Tab @files • ↑↓ history • /commands • !bash mode"
      onClose={() => setInputMode('default')}
    />
  )
}
