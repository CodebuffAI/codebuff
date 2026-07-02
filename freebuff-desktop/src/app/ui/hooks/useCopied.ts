/**
 * Copied-state for copy buttons: `copy(text)` writes to the clipboard and, on
 * real success, flips `copied` for a moment so the button can show a checkmark.
 * One shared implementation (Message, Markdown code blocks, NoticeCard) so the
 * timing stays uniform — and the reset timer is properly cleared on re-copy and
 * unmount, which the previous per-component copies never did.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

import { copyText } from '../lib/clipboard'

export function useCopied(resetMs = 1200) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  const copy = useCallback(
    (text: string) => {
      void copyText(text).then((ok) => {
        if (!ok) return
        setCopied(true)
        clearTimeout(timer.current)
        timer.current = setTimeout(() => setCopied(false), resetMs)
      })
    },
    [resetMs],
  )
  return { copied, copy }
}
