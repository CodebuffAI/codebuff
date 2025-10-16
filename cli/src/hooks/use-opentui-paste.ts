import { useAppContext } from '@opentui/react'
import { useEffect, useRef } from 'react'

import type { PasteEvent } from '@opentui/core'

type PasteHandler = (event: PasteEvent) => void

/**
 * Subscribe to the OpenTUI key handler paste events.
 * Allows React components to react to bracketed paste sequences.
 */
export const useOpentuiPaste = (handler: PasteHandler | null | undefined) => {
  const { keyHandler } = useAppContext()
  const handlerRef = useRef<PasteHandler | null | undefined>(handler)

  useEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!keyHandler) return

    const listener = (event: PasteEvent) => {
      handlerRef.current?.(event)
    }

    keyHandler.on('paste', listener)

    return () => {
      keyHandler.off('paste', listener)
    }
  }, [keyHandler])
}
