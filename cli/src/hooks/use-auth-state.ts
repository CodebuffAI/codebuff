import { useCallback, useEffect } from 'react'

import { useAuthQuery, useLogoutMutation } from './use-auth-query'
import { useLoginStore } from '../state/login-store'
import { useAuthStore } from '../state/auth-store'
import { getUserCredentials } from '../utils/auth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { identifyUser } from '../utils/analytics'
import { loggerContext } from '../utils/logger'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { User } from '../utils/auth'

interface UseAuthStateOptions {
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setInputFocused: (focused: boolean) => void
  resetChatStore: () => void
}

export const useAuthState = ({
  requireAuth,
  hasInvalidCredentials,
  inputRef,
  setInputFocused,
  resetChatStore,
}: UseAuthStateOptions) => {
  const authQuery = useAuthQuery()
  const logoutMutation = useLogoutMutation()
  const { resetLoginState } = useLoginStore()
  const {
    isAuthenticated,
    user,
    setIsAuthenticated,
    setUser,
  } = useAuthStore()

  // Initialize auth state from requireAuth when mounting or when it changes
  useEffect(() => {
    if (requireAuth === null) {
      return
    }
    // If auth is not required, we consider the user authenticated by default
    setIsAuthenticated(!requireAuth)
  }, [requireAuth, setIsAuthenticated])

  // Update authentication state based on query results
  useEffect(() => {
    if (authQuery.isSuccess && authQuery.data) {
      if (isAuthenticated !== true) {
        setIsAuthenticated(true)
      }

      if (!user) {
        const userCredentials = getUserCredentials()
        const userData: User = {
          id: authQuery.data.id,
          name: userCredentials?.name || '',
          email: authQuery.data.email || '',
          authToken: userCredentials?.authToken || '',
        }
        setUser(userData)

        loggerContext.userId = authQuery.data.id
        loggerContext.userEmail = authQuery.data.email

        identifyUser(authQuery.data.id, {
          email: authQuery.data.email,
        })
      }
    } else if (authQuery.isError) {
      if (isAuthenticated !== false) {
        setIsAuthenticated(false)
      }
      if (user) {
        setUser(null)
      }

      delete loggerContext.userId
      delete loggerContext.userEmail
    }
  }, [
    authQuery.isSuccess,
    authQuery.isError,
    authQuery.data,
    isAuthenticated,
    user,
    setIsAuthenticated,
    setUser,
  ])

  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      resetCodebuffClient()
      resetChatStore()
      resetLoginState()
      setInputFocused(true)
      setUser(loggedInUser)
      setIsAuthenticated(true)

      if (loggedInUser.id && loggedInUser.email) {
        loggerContext.userId = loggedInUser.id
        loggerContext.userEmail = loggedInUser.email

        identifyUser(loggedInUser.id, {
          email: loggedInUser.email,
        })
      }
    },
    [resetChatStore, resetLoginState, setInputFocused, setIsAuthenticated, setUser],
  )

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

  const logout = useCallback(
    () =>
      new Promise<void>((resolve) => {
        logoutMutation.mutate(undefined, {
          onSettled: () => resolve(),
        })
      }),
    [logoutMutation],
  )

  return {
    isAuthenticated,
    user,
    handleLoginSuccess,
    logout,
  }
}
