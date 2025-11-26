import { useMutation } from '@tanstack/react-query'
import open from 'open'

import { WEBSITE_URL } from '../login/constants'
import { generateLoginUrl } from '../login/login-flow'
import { logger } from '../utils/logger'

interface UseFetchLoginUrlParams {
  setLoginUrl: (url: string | null) => void
  setFingerprintHash: (hash: string | null) => void
  setExpiresAt: (expiresAt: string | null) => void
  setIsWaitingForEnter: (waiting: boolean) => void
  setHasOpenedBrowser: (opened: boolean) => void
  setError: (error: string | null) => void
}

/**
 * Custom hook that handles fetching the login URL and opening the browser
 */
export function useFetchLoginUrl({
  setLoginUrl,
  setFingerprintHash,
  setExpiresAt,
  setIsWaitingForEnter,
  setHasOpenedBrowser,
  setError,
}: UseFetchLoginUrlParams) {
  const fetchLoginUrlMutation = useMutation({
    mutationFn: async (fingerprintId: string) => {
      return generateLoginUrl(
        {
          logger,
        },
        {
          baseUrl: WEBSITE_URL,
          fingerprintId,
        },
      )
    },
    onSuccess: async (data) => {
      setLoginUrl(data.loginUrl)
      setFingerprintHash(data.fingerprintHash)
      setExpiresAt(data.expiresAt)
      setIsWaitingForEnter(true)
      setHasOpenedBrowser(true)

      // Open browser after fetching URL
      try {
        await open(data.loginUrl)
      } catch (err) {
        logger.error(err, 'Failed to open browser')
        // Don't show error, user can still click the URL
      }
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Failed to get login URL')
      logger.error(
        {
          error: err instanceof Error ? err.message : String(err),
        },
        'Failed to get login URL',
      )
    },
  })

  return fetchLoginUrlMutation
}
