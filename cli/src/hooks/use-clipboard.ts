import { useRenderer } from '@opentui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

export const useClipboard = () => {
  const renderer = useRenderer()
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)
  const clipboardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingCopyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )
  const copyDelayRef = useRef<number>(2000)
  const pendingSelectionRef = useRef<string | null>(null)
  const lastCopiedRef = useRef<string | null>(null)

  const copyToClipboard = useCallback(async (text: string) => {
    if (!text || text.trim().length === 0) return

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text)
      } else if (typeof process !== 'undefined' && process.platform) {
        const { execSync } = require('child_process')
        if (process.platform === 'darwin') {
          execSync('pbcopy', { input: text })
        } else if (process.platform === 'linux') {
          try {
            execSync('xclip -selection clipboard', { input: text })
          } catch {
            execSync('xsel --clipboard --input', { input: text })
          }
        } else if (process.platform === 'win32') {
          execSync('clip', { input: text })
        }
      } else {
        return
      }

      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current)
      }

      const preview = text.replace(/\s+/g, ' ').trim()
      const truncated =
        preview.length > 40 ? `${preview.slice(0, 37)}…` : preview
      setClipboardMessage(`Copied: "${truncated}"`)
      clipboardTimeoutRef.current = setTimeout(() => {
        setClipboardMessage(null)
        clipboardTimeoutRef.current = null
      }, 3000)
    } catch (error) {
      logger.error(error, 'Failed to copy to clipboard')
    }
  }, [])

  useEffect(() => {
    const handleSelection = (selectionEvent: any) => {
      const selectionObj = selectionEvent ?? (renderer as any)?.getSelection?.()
      const rawText: string | null = selectionObj?.getSelectedText
        ? selectionObj.getSelectedText()
        : typeof selectionObj === 'string'
          ? selectionObj
          : null

      if (!rawText || rawText.trim().length === 0) {
        pendingSelectionRef.current = null
        if (pendingCopyTimeoutRef.current) {
          clearTimeout(pendingCopyTimeoutRef.current)
          pendingCopyTimeoutRef.current = null
        }
        return
      }

      if (rawText === pendingSelectionRef.current) {
        return
      }

      pendingSelectionRef.current = rawText

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
        void copyToClipboard(pending)
      }, copyDelayRef.current)
    }

    if (renderer?.on) {
      renderer.on('selection', handleSelection)
      return () => {
        renderer.off?.('selection', handleSelection)
      }
    }
    return undefined
  }, [renderer, copyToClipboard])

  useEffect(() => {
    return () => {
      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current)
      }
      if (pendingCopyTimeoutRef.current) {
        clearTimeout(pendingCopyTimeoutRef.current)
        pendingCopyTimeoutRef.current = null
      }
    }
  }, [])

  return {
    clipboardMessage,
  }
}
