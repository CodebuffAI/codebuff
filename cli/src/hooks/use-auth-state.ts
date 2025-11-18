import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuthQuery, useLogoutMutation } from './use-auth-query'
import { useLoginStore } from '../state/login-store'
import { getUserCredentials } from '../utils/auth'
import { resetCodebuffClient } from '../utils/codebuff-client'
import { isAuthenticationError, isNetworkError } from '@codebuff/sdk'

import type { MultilineInputHandle } from '../components/multiline-input'
import type { User } from '../utils/auth'

interface UseAuthStateOptions {
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  inputRef: React.MutableRefObject<MultilineInputHandle | null>
  setInputFocused: (focused: boolean) => void
  resetChatStore: () => void
}

export type AuthError = {
  type: 'network' | 'authentication' | 'unknown'
  message: string
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

  const initialAuthState =
    requireAuth === false ? true : requireAuth === true ? false : null
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(
    initialAuthState,
  )
  const [user, setUser] = useState<User | null>(null)
  const [authError, setAuthError] = useState<AuthError | null>(null)

  useEffect(() => {
    if (requireAuth === null) {
      return
    }
    setIsAuthenticated(!requireAuth)
  }, [requireAuth])

  useEffect(() => {
    if (authQuery.isSuccess && authQuery.data) {
      setIsAuthenticated(true)
      setAuthError(null)
      if (!user) {
        const userCredentials = getUserCredentials()
        const userData: User = {
          id: authQuery.data.id,
          name: userCredentials?.name || '',
          email: authQuery.data.email || '',
          authToken: userCredentials?.authToken || '',
        }
        setUser(userData)
      }
    } else if (authQuery.isError) {
      const error = authQuery.error

      if (isNetworkError(error)) {
        setAuthError({
          type: 'network',
          message: 'Unable to reach server. Please check your connection.',
        })
      } else if (isAuthenticationError(error)) {
        setAuthError({
          type: 'authentication',
          message: 'Invalid API key. Please log in again.',
        })
        setIsAuthenticated(false)
        setUser(null)
      } else {
        setAuthError({
          type: 'unknown',
          message: error?.message || 'Authentication check failed',
        })
        setIsAuthenticated(false)
        setUser(null)
      }
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.data, authQuery.error, user])

  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      resetCodebuffClient()
      resetChatStore()
      resetLoginState()
      setInputFocused(true)
      setUser(loggedInUser)
      setIsAuthenticated(true)
    },
    [resetChatStore, resetLoginState, setInputFocused],
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

  return {
    isAuthenticated,
    setIsAuthenticated,
    user,
    setUser,
    authError,
    handleLoginSuccess,
    logoutMutation,
  }
}
