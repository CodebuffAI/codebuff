import { useRenderer } from '@opentui/react'
import { useEffect, useRef, useState } from 'react'

import { CURSOR_CHAR } from '../components/multiline-input'
import {
  copyTextToClipboard,
  registerClipboardRenderer,
  subscribeClipboardMessages,
  unregisterClipboardRenderer,
} from '../utils/clipboard'
import { loadSettings } from '../utils/settings'

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
  const [hasSelection, setHasSelection] = useState(false)
  const pendingCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const pendingSelectionRef = useRef<string | null>(null)
  const lastCopiedRef = useRef<string | null>(null)
  // Read the privacy setting once on mount rather than on every selection
  // event (which fires frequently during text dragging). loadSettings() does
  // synchronous fs I/O + JSON.parse, so we cache the value in a ref.
  const autoCopyEnabledRef = useRef(true)

  useEffect(() => {
    autoCopyEnabledRef.current = loadSettings().autoCopySelection ?? true
  }, [])

  useEffect(() => {
    return subscribeClipboardMessages(setStatusMessage)
  }, [])

  // Register the renderer globally so all copyTextToClipboard callers
  // can use the renderer's OSC 52 method when available.
  useEffect(() => {
    if (renderer) {
      registerClipboardRenderer(renderer as unknown as Record<string, unknown>)
      return () => {
        unregisterClipboardRenderer()
      }
    }
    return undefined
  }, [renderer])

  useEffect(() => {
    const handleSelection = (selectionEvent: any) => {
      const selectionObj = selectionEvent ?? (renderer as any)?.getSelection?.()
      const rawText: string | null = selectionObj?.getSelectedText
        ? selectionObj.getSelectedText()
        : typeof selectionObj === 'string'
          ? selectionObj
          : null

      // Filter out cursor character from selected text
      const cleanedText =
        rawText?.replaceAll(CURSOR_CHAR, '') ?? null

      if (!cleanedText || cleanedText.trim().length === 0) {
        pendingSelectionRef.current = null
        setHasSelection(false)
        if (pendingCopyTimeoutRef.current) {
          clearTimeout(pendingCopyTimeoutRef.current)
          pendingCopyTimeoutRef.current = null
        }
        return
      }

      if (cleanedText === pendingSelectionRef.current) {
        return
      }

      // Track that there's an active selection for visual feedback
      setHasSelection(true)

      pendingSelectionRef.current = cleanedText

      // Privacy opt-out: if `autoCopySelection` is disabled in settings, track
      // the selection for visual feedback but do NOT auto-copy to the system
      // clipboard. The user must invoke an explicit copy command instead.
      if (!autoCopyEnabledRef.current) {
        return
      }

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
        })
          .then(() => {
            // Clear selection visual state after successful copy
            setHasSelection(false)
          })
          .catch(() => {
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
    hasSelection,
  }
}
