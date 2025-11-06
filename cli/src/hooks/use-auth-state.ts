import { useCallback, useEffect, useRef, useState } from 'react'

import { useAuthQuery, useLogoutMutation } from './use-auth-query'
import { getUserCredentials } from '../utils/auth'
import { logger } from '../utils/logger'

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
      }
    } else if (authQuery.isError) {
      setIsAuthenticated(false)
      setUser(null)
    }
  }, [authQuery.isSuccess, authQuery.isError, authQuery.data, user])

  // Handle successful login
  const handleLoginSuccess = useCallback(
    (loggedInUser: User) => {
      logger.info(
        {
          userName: loggedInUser.name,
          userEmail: loggedInUser.email,
          userId: loggedInUser.id,
        },
        '🎊 handleLoginSuccess called - updating UI state',
      )

      logger.info('🔄 Resetting chat store...')
      resetChatStore()
      logger.info('✅ Chat store reset')

      logger.info('🎯 Setting input focused...')
      setInputFocused(true)
      logger.info('✅ Input focused')

      logger.info('👤 Setting user state...')
      setUser(loggedInUser)
      logger.info('✅ User state set')

      logger.info('🔓 Setting isAuthenticated to true...')
      setIsAuthenticated(true)
      logger.info('✅ isAuthenticated set to true - modal should close now')

      logger.info(
        { user: loggedInUser.name },
        '🎉 Login flow completed successfully!',
      )
    },
    [resetChatStore, setInputFocused],
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
