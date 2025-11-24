import { useRenderer } from '@opentui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import {
  copyTextToClipboard,
  subscribeClipboardMessages,
} from '../utils/clipboard'
import { CURSOR_CHAR } from '../components/multiline-input'

function formatDefaultClipboardMessage(text: string): string | null {
  const preview = text.replace(/\s+/g, ' ').trim()
  if (!preview) {
    return null
  }
  const truncated = preview.length > 40 ? `${preview.slice(0, 37)}…` : preview
  return `Copied: "${truncated}"`
}

export const useClipboard = () => {
  const renderer = useRenderer()
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const pendingCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const pendingSelectionRef = useRef<string | null>(null)
  const lastCopiedRef = useRef<string | null>(null)

  useEffect(() => {
    return subscribeClipboardMessages(setStatusMessage)
  }, [])

  useEffect(() => {
    const handleSelection = (selectionEvent: any) => {
      const selectionObj = selectionEvent ?? (renderer as any)?.getSelection?.()
      const rawText: string | null = selectionObj?.getSelectedText
        ? selectionObj.getSelectedText()
        : typeof selectionObj === 'string'
          ? selectionObj
          : null

      // Filter out cursor character from selected text
      const cleanedText = rawText?.replace(new RegExp(CURSOR_CHAR, 'g'), '') ?? null

      if (!cleanedText || cleanedText.trim().length === 0) {
        pendingSelectionRef.current = null
        if (pendingCopyTimeoutRef.current) {
          clearTimeout(pendingCopyTimeoutRef.current)
          pendingCopyTimeoutRef.current = null
        }
        return
      }

      if (cleanedText === pendingSelectionRef.current) {
        return
      }

      pendingSelectionRef.current = cleanedText

      if (pendingCopyTimeoutRef.current) {
        clearTimeout(pendingCopyTimeoutRef.current)
      }

      pendingCopyTimeoutRef.current = setTimeout(() => {
        pendingCopyTimeoutRef.current = null
        const pending = pendingSelectionRef.current
        if (!pending || pending === lastCopiedRef.current) {
          return
        }

        lastCopiedRef.current = pending
        const successMessage = formatDefaultClipboardMessage(pending)
        void copyTextToClipboard(pending, {
          successMessage,
          durationMs: 3000,
        }).catch(() => {
          // Errors are logged within copyTextToClipboard
        })
      }, 250)
    }

    if (renderer?.on) {
      renderer.on('selection', handleSelection)
      return () => {
        renderer.off?.('selection', handleSelection)
      }
    }
    return undefined
  }, [renderer])

  useEffect(() => {
    return () => {
      if (pendingCopyTimeoutRef.current) {
        clearTimeout(pendingCopyTimeoutRef.current)
        pendingCopyTimeoutRef.current = null
      }
    }
  }, [])

  return {
    statusMessage,
  }
}
