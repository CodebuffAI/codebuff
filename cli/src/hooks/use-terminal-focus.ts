import { useEffect } from 'react'

import { logger } from '../utils/logger'
import { getTerminalProtocolController } from '../utils/terminal-protocol-controller'

export interface UseTerminalFocusOptions {
  onFocusChange: (focused: boolean) => void
  onSupportDetected?: () => void
}

/**
 * Subscribe to the terminal protocol controller's parsed focus state. OpenTUI
 * owns normal terminal input, while the controller enables focus reports for
 * the lifetime of the active subscribers.
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
