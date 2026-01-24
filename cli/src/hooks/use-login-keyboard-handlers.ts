import { useKeyboard } from '@opentui/react'
import { useCallback } from 'react'

import type { KeyEvent } from '@opentui/core'

interface UseLoginKeyboardHandlersParams {
  loginUrl: string | null
  hasOpenedBrowser: boolean
  loading: boolean
  onFetchLoginUrl: () => void
  onCopyUrl: (url: string) => Promise<void> | void
}

/**
 * Custom hook that handles keyboard input for the login modal
 * - Enter key: fetch login URL and open browser
 * - 'c' key: copy URL to clipboard
 * - Ctrl+C: exit the application
 */
export function useLoginKeyboardHandlers({
  loginUrl,
  hasOpenedBrowser,
  loading,
  onFetchLoginUrl,
  onCopyUrl,
}: UseLoginKeyboardHandlersParams) {
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        const isEnter =
          (key.name === 'return' || key.name === 'enter') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift

        const isCKey = key.name === 'c' && !key.ctrl && !key.meta && !key.shift
        const isCtrlC = key.ctrl && key.name === 'c'

        if (isCtrlC) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }
          process.exit(0)
        }

        if (isEnter && !hasOpenedBrowser && !loading) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          onFetchLoginUrl()
        }

        if (isCKey && loginUrl && hasOpenedBrowser) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          // Fire-and-forget the async copy function with .catch() to prevent
          // unhandled promise rejections if the implementation changes
          void Promise.resolve(onCopyUrl(loginUrl)).catch(() => {})
        }
      },
      [loginUrl, hasOpenedBrowser, loading, onCopyUrl, onFetchLoginUrl],
    ),
  )
}
