import { useEffect } from 'react'

import { logger } from '../utils/logger'
import { getTerminalProtocolController } from '../utils/terminal-protocol-controller'

export interface UseTerminalFocusOptions {
  onFocusChange: (focused: boolean) => void
  onSupportDetected?: () => void
}

/**
 * Subscribe to the terminal protocol controller's parsed focus state. OpenTUI
 * owns protocol setup; the controller keeps detection live even when it must
 * suppress OpenTUI's mode restoration during a command.
 */
export function useTerminalFocus({
  onFocusChange,
  onSupportDetected,
}: UseTerminalFocusOptions): void {
  useEffect(() => {
    const controller = getTerminalProtocolController()
    if (!controller) {
      logger.debug({}, 'Terminal protocol controller is not installed')
      return
    }

    return controller.subscribeToFocus({ onFocusChange, onSupportDetected })
  }, [onFocusChange, onSupportDetected])
}
