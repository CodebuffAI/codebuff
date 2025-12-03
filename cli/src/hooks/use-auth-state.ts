import { useCallback, useEffect, useState } from 'react'

import { useAuthQuery, useLogoutMutation } from './use-auth-query'
import { useLoginStore } from '../state/login-store'
import { identifyUser } from '../utils/analytics'
import { getUserCredentials } from '../utils/auth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { loggerContext } from '../utils/logger'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { User } from '../utils/auth'

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

  const initialAuthState =
    requireAuth === false ? true : requireAuth === true ? false : null
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
        
        // Set logger context for analytics
        loggerContext.userId = authQuery.data.id
        loggerContext.userEmail = authQuery.data.email
        
        // Identify user with PostHog
        identifyUser(authQuery.data.id, {
          email: authQuery.data.email,
        })
      }
    } else if (authQuery.isError) {
      setIsAuthenticated(false)
      setUser(null)
      
      // Clear logger context on auth error
      delete loggerContext.userId
      delete loggerContext.userEmail
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.data, user])

  // Handle successful login
  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      // Reset the SDK client to pick up new credentials
      resetCodebuffClient()
      resetChatStore()
      resetLoginState()
      setInputFocused(true)
      setUser(loggedInUser)
      setIsAuthenticated(true)
      
      // Set logger context for analytics
      if (loggedInUser.id && loggedInUser.email) {
        loggerContext.userId = loggedInUser.id
        loggerContext.userEmail = loggedInUser.email
        
        // Identify user with PostHog
        identifyUser(loggedInUser.id, {
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
