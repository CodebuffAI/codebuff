import { useEffect } from 'react'

import { useStore } from '../store/store'

/**
 * Browser-style tab shortcuts. Every binding is Cmd/Ctrl-modified, so they fire
 * even while typing in the composer (matching real browsers) and never collide
 * with plain text entry.
 *
 *   Cmd+T            new tab
 *   Cmd+Shift+T      reopen last closed tab
 *   Cmd+W            close tab
 *   Cmd+Shift+] / Ctrl+Tab          next tab
 *   Cmd+Shift+[ / Ctrl+Shift+Tab    prev tab
 *   Cmd+1..8         jump to tab N; Cmd+9 last tab
 */
export function useKeyboard() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState()
      const mod = e.metaKey || e.ctrlKey

      // Ctrl+Tab / Ctrl+Shift+Tab cycle (Chromium would otherwise swallow it).
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault()
        s.cycleTab(e.shiftKey ? -1 : 1)
        return
      }

      if (!mod) return

      switch (e.key) {
        case 't':
        case 'T':
          e.preventDefault()
          if (e.shiftKey) s.rehydrateLast()
          else s.newThread()
          return
        case 'w':
        case 'W':
          if (s.activeId) {
            e.preventDefault()
            s.closeTab(s.activeId)
          }
          return
        case ']':
          if (e.shiftKey) {
            e.preventDefault()
            s.cycleTab(1)
          }
          return
        case '[':
          if (e.shiftKey) {
            e.preventDefault()
            s.cycleTab(-1)
          }
          return
      }

      if (/^[1-9]$/.test(e.key)) {
        e.preventDefault()
        s.jumpTab(Number(e.key) - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
