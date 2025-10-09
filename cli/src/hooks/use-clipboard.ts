import { useRenderer } from '@opentui/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { logger } from '../utils/logger'

export const useClipboard = () => {
  const renderer = useRenderer()
  const [clipboardMessage, setClipboardMessage] = useState<string | null>(null)
  const clipboardTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  )

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

      setClipboardMessage('Copied to clipboard')
      clipboardTimeoutRef.current = setTimeout(() => {
        setClipboardMessage(null)
        clipboardTimeoutRef.current = null
      }, 3000)
    } catch (error) {
      logger.error('Failed to copy to clipboard', error)
    }
  }, [])

  useEffect(() => {
    const handleSelection = () => {
      const selection = (renderer as any)?.getSelection?.()
      if (selection && selection.length > 0) {
        void copyToClipboard(selection)
      }
    }

    if (renderer) {
      renderer.on?.('selectionchange', handleSelection)
      return () => {
        renderer.off?.('selectionchange', handleSelection)
      }
    }
    return undefined
  }, [renderer, copyToClipboard])

  useEffect(() => {
    return () => {
      if (clipboardTimeoutRef.current) {
        clearTimeout(clipboardTimeoutRef.current)
      }
    }
  }, [])

  return {
    clipboardMessage,
  }
}
