import { useRenderer } from '@opentui/react'
import open from 'open'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { TerminalLink } from './terminal-link'
import { useLoginMutation } from '../hooks/use-auth-query'
import { useFetchLoginUrl } from '../hooks/use-fetch-login-url'
import { useLoginKeyboardHandlers } from '../hooks/use-login-keyboard-handlers'
import { useLoginPolling } from '../hooks/use-login-polling'
import { useLogo } from '../hooks/use-logo'
import { useSheenAnimation } from '../hooks/use-sheen-animation'
import { useTheme } from '../hooks/use-theme'
import {
  DEFAULT_TERMINAL_HEIGHT,
  MODAL_VERTICAL_MARGIN,
  MAX_MODAL_BASE_HEIGHT,
  WARNING_BANNER_HEIGHT,
} from '../login/constants'
import {
  formatUrl,
  generateFingerprintId,
  calculateResponsiveLayout,
  calculateModalDimensions,
} from '../login/utils'
import { useLoginStore } from '../state/login-store'
import { copyTextToClipboard } from '../utils/clipboard'
import { logger } from '../utils/logger'

import type { User } from '../utils/auth'

interface LoginModalProps {
  onLoginSuccess: (user: User) => void
  hasInvalidCredentials?: boolean | null
}

export const LoginModal = ({
  onLoginSuccess,
  hasInvalidCredentials = false,
}: LoginModalProps) => {
  const renderer = useRenderer()
  const theme = useTheme()

  // Use zustand store for all state
  const {
    loginUrl,
    loading,
    error,
    fingerprintHash,
    expiresAt,
    isWaitingForEnter,
    hasOpenedBrowser,
    sheenPosition,
    copyMessage,
    justCopied,
    hasClickedLink,
    setLoginUrl,
    setLoading,
    setError,
    setFingerprintHash,
    setExpiresAt,
    setIsWaitingForEnter,
    setHasOpenedBrowser,
    setSheenPosition,
    setCopyMessage,
    setJustCopied,
    setHasClickedLink,
  } = useLoginStore()

  // Generate fingerprint ID (only once on mount)
  const [fingerprintId] = useState(() => generateFingerprintId())

  // Use TanStack Query for login mutation
  const loginMutation = useLoginMutation()

  // Use custom hook for fetching login URL
  const fetchLoginUrlMutation = useFetchLoginUrl({
    setLoginUrl,
    setFingerprintHash,
    setExpiresAt,
    setIsWaitingForEnter,
    setHasOpenedBrowser,
    setError,
  })

  // Copy to clipboard function
  const copyToClipboard = useCallback(
    async (text: string) => {
      if (!text || text.trim().length === 0) return

      setHasClickedLink(true)

      try {
        await copyTextToClipboard(text, {
          suppressGlobalMessage: true,
        })

        setJustCopied(true)
        setCopyMessage('✓ URL copied to clipboard!')
        setTimeout(() => {
          setCopyMessage(null)
          setJustCopied(false)
        }, 3000)
      } catch (err) {
        logger.error(err, 'Failed to copy to clipboard')
        setCopyMessage('✗ Failed to copy to clipboard')
        setTimeout(() => {
          setCopyMessage(null)
        }, 3000)
      }
    },
    [setHasClickedLink, setJustCopied, setCopyMessage],
  )

  // Fetch login URL and open browser using mutation
  const fetchLoginUrlAndOpenBrowser = useCallback(async () => {
    if (loading || hasOpenedBrowser) return

    setLoading(true)
    setError(null)

    fetchLoginUrlMutation.mutate(fingerprintId, {
      onSettled: () => {
        setLoading(false)
      },
    })
  }, [
    fingerprintId,
    loading,
    hasOpenedBrowser,
    setLoading,
    setError,
    fetchLoginUrlMutation,
  ])

  // Store mutation and callback in refs to prevent effect re-runs
  const loginMutationRef = useRef(loginMutation)
  const onLoginSuccessRef = useRef(onLoginSuccess)

  useEffect(() => {
    loginMutationRef.current = loginMutation
  }, [loginMutation])

  useEffect(() => {
    onLoginSuccessRef.current = onLoginSuccess
  }, [onLoginSuccess])

  // Handle successful login from polling
  const handleLoginSuccess = useCallback((user: User) => {
    loginMutationRef.current.mutate(user, {
      onSuccess: (validatedUser) => {
        logger.info(
          {
            user: validatedUser.name,
            validatedFields: Object.keys(validatedUser),
          },
          '✅ Login mutation succeeded, notifying parent',
        )
        onLoginSuccessRef.current(validatedUser)
      },
      onError: (error) => {
        logger.error(
          {
            error: error instanceof Error ? error.message : String(error),
          },
          '❌ Login validation failed, proceeding with raw user',
        )
        onLoginSuccessRef.current(user)
      },
    })
  }, [])

  // Handle polling timeout
  const handleTimeout = useCallback(() => {
    setError('Login timed out. Please try again.')
    setIsWaitingForEnter(false)
  }, [setError, setIsWaitingForEnter])

  // Handle polling error
  const handlePollingError = useCallback(
    (pollingError: string) => {
      setError(pollingError)
      setIsWaitingForEnter(false)
    },
    [setError, setIsWaitingForEnter],
  )

  // Use custom hook for login polling
  useLoginPolling({
    loginUrl,
    fingerprintId,
    fingerprintHash,
    expiresAt,
    isWaitingForEnter,
    onSuccess: handleLoginSuccess,
    onTimeout: handleTimeout,
    onError: handlePollingError,
  })

  // Use custom hook for keyboard handlers
  useLoginKeyboardHandlers({
    loginUrl,
    hasOpenedBrowser,
    loading,
    onFetchLoginUrl: fetchLoginUrlAndOpenBrowser,
    onCopyUrl: copyToClipboard,
  })

  // Auto-copy URL when browser is opened
  useEffect(() => {
    if (hasOpenedBrowser && loginUrl) {
      copyToClipboard(loginUrl)
    }
  }, [hasOpenedBrowser, loginUrl, copyToClipboard])

  // Calculate terminal width and height for responsive display
  const terminalWidth = renderer?.width || 80
  const terminalHeight = renderer?.height || 24

  // Calculate responsive layout
  const {
    isVerySmall,
    isNarrow,
    containerPadding,
    headerMarginTop,
    headerMarginBottom,
    sectionMarginBottom,
    contentMaxWidth,
    maxUrlWidth,
  } = calculateResponsiveLayout(terminalWidth, terminalHeight)

  // Format login URL lines
  const formatLoginUrlLines = useCallback(
    (text: string, width?: number) => formatUrl(text, width ?? maxUrlWidth),
    [maxUrlWidth],
  )

  // Handle login URL activation
  const handleActivateLoginUrl = useCallback(async () => {
    if (!loginUrl) {
      return
    }
    try {
      await open(loginUrl)
    } catch (err) {
      logger.error(err, 'Failed to open browser on link click')
    }
    return copyToClipboard(loginUrl)
  }, [loginUrl, copyToClipboard])

  // Use custom hook for sheen animation
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    terminalWidth: renderer?.width,
    sheenPosition,
    setSheenPosition,
  })

  // Get the logo component based on available content width
  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    applySheenToChar,
    textColor: theme.foreground,
  })

  // Calculate modal dimensions
  const { modalHeight } = calculateModalDimensions(
    terminalHeight,
    !!hasInvalidCredentials,
    DEFAULT_TERMINAL_HEIGHT,
    MODAL_VERTICAL_MARGIN,
    MAX_MODAL_BASE_HEIGHT,
    WARNING_BANNER_HEIGHT,
  )

  // Calculate modal width and center position
  const modalWidth = Math.floor(terminalWidth * 0.95)
  const modalLeft = Math.floor((terminalWidth - modalWidth) / 2)
  const modalTop = Math.floor((terminalHeight - modalHeight) / 2)

  // Format URL for display (wrap if needed)
  return (
    <box
      position="absolute"
      left={modalLeft}
      top={modalTop}
      border
      borderStyle="double"
      borderColor={theme.primary}
      style={{
        width: modalWidth,
        height: modalHeight,
        maxHeight: modalHeight,
        backgroundColor: theme.background,
        padding: 0,
        flexDirection: 'column',
      }}
    >
      {/* Sticky banner at top - outside scrollbox */}
      {hasInvalidCredentials && (
        <box
          style={{
            width: '100%',
            padding: 1,
            backgroundColor: theme.error,
            borderStyle: 'single',
            borderColor: theme.error,
            flexShrink: 0,
          }}
        >
          <text style={{ wrapMode: 'word' }}>
            <span fg={theme.secondary}>
              {isNarrow
                ? "⚠ Found API key but it's invalid. Please log in again."
                : '⚠ We found an API key but it appears to be invalid. Please log in again to continue.'}
            </span>
          </text>
        </box>
      )}

      <box
        style={{
          flexDirection: 'column',
          alignItems: 'center',
          width: '100%',
          height: '100%',
          backgroundColor: theme.background,
          padding: containerPadding,
          gap: 0,
        }}
      >
        {/* Header - Logo rendered by useLogo hook */}
        <box
          key="codebuff-logo"
          style={{
            flexDirection: 'column',
            alignItems: contentMaxWidth < 40 ? 'center' : 'flex-start',
            marginTop: headerMarginTop,
            marginBottom: headerMarginBottom,
            flexShrink: 0,
          }}
        >
          {logoComponent}
        </box>

        {/* Loading state */}
        {loading && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'none' }}>
              <span fg={theme.secondary}>Loading...</span>
            </text>
          </box>
        )}

        {/* Error state */}
        {error && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg="red">Error: {error}</span>
            </text>
            {!isVerySmall && (
              <text style={{ wrapMode: 'word' }}>
                <span fg={theme.secondary}>
                  {isNarrow
                    ? 'Please try again'
                    : 'Please restart the CLI and try again'}
                </span>
              </text>
            )}
          </box>
        )}

        {/* Login instructions - before opening browser */}
        {!loading && !error && !hasOpenedBrowser && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.primary}>
                {isNarrow
                  ? 'Press ENTER to login...'
                  : 'Press ENTER to open your browser and finish logging in...'}
              </span>
            </text>
          </box>
        )}

        {/* After opening browser - show URL as fallback */}
        {!loading && !error && loginUrl && hasOpenedBrowser && (
          <box
            style={{
              flexDirection: 'column',
              alignItems: 'center',
              marginBottom: sectionMarginBottom,
              maxWidth: contentMaxWidth,
              flexShrink: 0,
              gap: isVerySmall ? 0 : 1,
            }}
          >
            <text style={{ wrapMode: 'word' }}>
              <span fg={theme.secondary}>
                {isNarrow ? 'Click to copy:' : 'Click link to copy:'}
              </span>
            </text>
            <box
              style={{
                marginTop: 0,
                width: '100%',
                flexShrink: 0,
              }}
            >
              <TerminalLink
                text={loginUrl}
                maxWidth={maxUrlWidth}
                formatLines={formatLoginUrlLines}
                color={hasClickedLink ? theme.success : theme.info}
                activeColor={theme.success}
                underlineOnHover={true}
                isActive={justCopied}
                onActivate={handleActivateLoginUrl}
                containerStyle={{
                  alignItems: 'flex-start',
                  flexShrink: 0,
                }}
              />
            </box>
            {copyMessage && (
              <box
                style={{
                  marginTop: isVerySmall ? 0 : 1,
                  flexDirection: 'column',
                  alignItems: 'center',
                  width: '100%',
                  flexShrink: 0,
                }}
              >
                <text style={{ wrapMode: 'none' }}>
                  <span
                    fg={
                      copyMessage.startsWith('✓')
                        ? theme.success
                        : theme.error
                    }
                  >
                    {copyMessage}
                  </span>
                </text>
              </box>
            )}
          </box>
        )}
      </box>
    </box>
  )
}
