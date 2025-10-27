import { useKeyboard } from '@opentui/react'
import { useCallback } from 'react'

interface UseLoginKeyboardHandlersParams {
  loginUrl: string | null
  hasOpenedBrowser: boolean
  loading: boolean
  onFetchLoginUrl: () => void
  onCopyUrl: (url: string) => void
}

/**
 * Custom hook that handles keyboard input for the login modal
 * - Enter key: fetch login URL and open browser
 * - 'c' key: copy URL to clipboard
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
      (key: any) => {
        const isEnter =
          (key.name === 'return' || key.name === 'enter') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift

        const isCKey = key.name === 'c' && !key.ctrl && !key.meta && !key.shift

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

          onCopyUrl(loginUrl)
        }
      },
      [loginUrl, hasOpenedBrowser, loading, onCopyUrl, onFetchLoginUrl],
    ),
  )
}
