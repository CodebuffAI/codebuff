import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { useCallback, useEffect, useState } from 'react'

import { useAuthQuery, useLogoutMutation } from './use-auth-query'
import { useLoginStore } from '../state/login-store'
import { identifyUser, trackEvent } from '../utils/analytics'
import { getUserCredentials } from '../utils/auth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { loggerContext } from '../utils/logger'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { User } from '../utils/auth'

const setAuthLoggerContext = (params: { userId: string; email: string }) => {
  loggerContext.userId = params.userId
  loggerContext.userEmail = params.email
  identifyUser(params.userId, { email: params.email })
}

const clearAuthLoggerContext = () => {
  delete loggerContext.userId
  delete loggerContext.userEmail
}

interface UseAuthStateOptions {
  requireAuth: boolean | null
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setInputFocused: (focused: boolean) => void
  resetChatStore: () => void
}

export const useAuthState = ({
  requireAuth,
  inputRef,
  setInputFocused,
  resetChatStore,
}: UseAuthStateOptions) => {
  const authQuery = useAuthQuery()
  const logoutMutation = useLogoutMutation()
  const { resetLoginState } = useLoginStore()

  const initialAuthState = requireAuth === null ? null : !requireAuth
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
    initialAuthState,
  )
  const [user, setUser] = useState<User | null>(null)

  // Update authentication state when requireAuth changes
  useEffect(() => {
    if (requireAuth === null) {
      return
    }
    setIsAuthenticated(!requireAuth)
  }, [requireAuth])

  // Update authentication state based on query results
  useEffect(() => {
    if (authQuery.isSuccess && authQuery.data) {
      setIsAuthenticated(true)
      if (!user) {
        const userCredentials = getUserCredentials()
        const userData: User = {
          id: authQuery.data.id,
          name: userCredentials?.name || '',
          email: authQuery.data.email || '',
          authToken: userCredentials?.authToken || '',
        }
        setUser(userData)
        setAuthLoggerContext({
          userId: authQuery.data.id,
          email: authQuery.data.email || '',
        })
      }
    } else if (authQuery.isError) {
      setIsAuthenticated(false)
      setUser(null)
      clearAuthLoggerContext()
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.data, user])

  // Handle successful login
  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      // Track successful login
      trackEvent(AnalyticsEvent.LOGIN, {
        userId: loggedInUser.id,
        hasEmail: Boolean(loggedInUser.email),
        hasName: Boolean(loggedInUser.name),
      })

      // Reset the SDK client to pick up new credentials
      resetCodebuffClient()
      resetChatStore()
      resetLoginState()
      setInputFocused(true)
      setUser(loggedInUser)
      setIsAuthenticated(true)

      if (loggedInUser.id && loggedInUser.email) {
        setAuthLoggerContext({
          userId: loggedInUser.id,
          email: loggedInUser.email,
        })
      }
    },
    [resetChatStore, resetLoginState, setInputFocused],
  )

  // Auto-focus input after authentication
  useEffect(() => {
    if (isAuthenticated !== true) return

    setInputFocused(true)

    const focusNow = () => {
      const handle = inputRef.current
      if (handle && typeof handle.focus === 'function') {
        handle.focus()
      }
    }

    focusNow()
    const timeoutId = setTimeout(focusNow, 0)

    return () => clearTimeout(timeoutId)
  }, [isAuthenticated, setInputFocused, inputRef])

  return {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser,
    handleLoginSuccess,
    logoutMutation,
  }
}
