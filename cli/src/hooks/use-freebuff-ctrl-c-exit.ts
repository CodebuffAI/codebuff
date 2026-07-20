import { useKeyboard } from '@opentui/react'
import { useCallback } from 'react'

import { exitCliCleanly } from '../utils/exit-cleanly'

import type { KeyEvent } from '@opentui/core'

/**
 * Bind Ctrl+C on a full-screen freebuff view to `exitCliCleanly`. Stdin
 * is in raw mode, so SIGINT never fires — the key arrives as a normal OpenTUI
 * key event and we route it through the shared cleanup path (flush analytics,
 * release the session seat, then process.exit).
 */
export function useFreebuffCtrlCExit(): void {
  useKeyboard(
    useCallback((key: KeyEvent) => {
      if (key.ctrl && key.name === 'c') {
        key.preventDefault?.()
        void exitCliCleanly()
      }
    }, []),
  )
}
