import { useKeyboard, useRenderer } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import open from 'open'

import { saveUserCredentials } from '../utils/auth'
import { copyTextToClipboard } from '../utils/clipboard'
import { logger } from '../utils/logger'
import {
  formatUrl,
  generateFingerprintId,
  getSheenColor,
  isLightModeColor,
  parseLogoLines,
} from './login-screen-utils'
import { TerminalLink } from './terminal-link'

import type { User } from '../utils/auth'
import type { ChatTheme } from '../utils/theme-system'

// Get the backend URLs from environment or use defaults
const BACKEND_URL =
  process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || 'https://app.codebuff.com'
const WEBSITE_URL =
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'

interface LoginScreenProps {
  onLoginSuccess: (user: User) => void
  theme: ChatTheme
  hasInvalidCredentials?: boolean | null
}

// Codebuff ASCII Logo
const LOGO = `
   ██████╗ ██████╗ ██████╗ ███████╗███████╗ ██╗   ██╗███████╗███████╗
  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔═══██╗██║   ██║██╔════╝██╔════╝
  ██║     ██║   ██║██║  ██║█████╗  ███████╔╝██║   ██║█████╗  █████╗
  ██║     ██║   ██║██║  ██║██╔══╝  ██╔═══██╗██║   ██║██╔══╝  ██╔══╝
  ╚██████╗╚██████╔╝██████╔╝███████╗███████╔╝╚██████╔╝██║     ██║
   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚══════╝  ╚═════╝ ╚═╝     ╚═╝
`

const LINK_COLOR_DEFAULT = '#3b82f6'
const LINK_COLOR_CLICKED = '#1e40af'
const LINK_COLOR_SUCCESS = '#22c55e'
const COPY_SUCCESS_COLOR = '#22c55e'
const COPY_ERROR_COLOR = '#ef4444'
const WARNING_COLOR = '#ef4444'

export const LoginScreen = ({ onLoginSuccess, theme, hasInvalidCredentials = false }: LoginScreenProps) => {
  const renderer = useRenderer()
  const [loginUrl, setLoginUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fingerprintHash, setFingerprintHash] = useState<string | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [isWaitingForEnter, setIsWaitingForEnter] = useState(false)
  const [hasOpenedBrowser, setHasOpenedBrowser] = useState(false)
  const [sheenPosition, setSheenPosition] = useState(0)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [justCopied, setJustCopied] = useState(false)
  const [hasClickedLink, setHasClickedLink] = useState(false)

  // Generate fingerprint ID
  const fingerprintId = useMemo(() => generateFingerprintId(), [])

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
    [],
  )

  // Fetch login URL and open browser
  const fetchLoginUrlAndOpenBrowser = useCallback(async () => {
    if (loading || hasOpenedBrowser) return

    setLoading(true)
    setError(null)

    logger.debug({ fingerprintId }, 'Fetching login URL')

    try {
      const response = await fetch(`${WEBSITE_URL}/api/auth/cli/code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fingerprintId }),
      })

      if (!response.ok) {
        throw new Error('Failed to get login URL')
      }

      const data = await response.json()
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to get login URL')
      logger.error(err, 'Failed to get login URL')
    } finally {
      setLoading(false)
    }
  }, [fingerprintId, loading, hasOpenedBrowser])

  // Poll for login status
  useEffect(() => {
    if (!loginUrl || !fingerprintHash || !expiresAt || !isWaitingForEnter) {
      return
    }

    const pollInterval = setInterval(async () => {
      try {
        const statusResponse = await fetch(
          `${WEBSITE_URL}/api/auth/cli/status?fingerprintId=${fingerprintId}&fingerprintHash=${fingerprintHash}&expiresAt=${expiresAt}`,
        )

        if (statusResponse.ok) {
          const data = await statusResponse.json()
          if (data.user) {
            // Login successful!
            saveUserCredentials(data.user)
            clearInterval(pollInterval)
            onLoginSuccess(data.user)
          }
        }
      } catch (err) {
        // Ignore errors during polling (e.g., 401 while waiting)
        logger.debug(err, 'Error polling login status')
      }
    }, 5000) // Poll every 5 seconds

    // Cleanup after 5 minutes
    const timeout = setTimeout(
      () => {
        clearInterval(pollInterval)
        setError('Login timed out. Please try again.')
        setIsWaitingForEnter(false)
      },
      5 * 60 * 1000,
    )

    return () => {
      clearInterval(pollInterval)
      clearTimeout(timeout)
    }
  }, [
    loginUrl,
    fingerprintHash,
    expiresAt,
    fingerprintId,
    isWaitingForEnter,
    onLoginSuccess,
  ])

  // Listen for Enter key to fetch URL and open browser, and 'c' key to copy URL
  useKeyboard(
    useCallback(
      (key: any) => {
        const isEnter =
          (key.name === 'return' || key.name === 'enter') &&
          !key.ctrl &&
          !key.meta &&
          !key.shift

        const isCKey =
          key.name === 'c' && !key.ctrl && !key.meta && !key.shift

        if (isEnter && !hasOpenedBrowser && !loading) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          fetchLoginUrlAndOpenBrowser()
        }

        if (isCKey && loginUrl && hasOpenedBrowser) {
          if (
            'preventDefault' in key &&
            typeof key.preventDefault === 'function'
          ) {
            key.preventDefault()
          }

          copyToClipboard(loginUrl)
        }
      },
      [loginUrl, hasOpenedBrowser, loading, copyToClipboard, fetchLoginUrlAndOpenBrowser],
    ),
  )

  // Auto-copy URL when browser is opened
  useEffect(() => {
    if (hasOpenedBrowser && loginUrl) {
      copyToClipboard(loginUrl)
    }
  }, [hasOpenedBrowser, loginUrl, copyToClipboard])

  // Animate the sheen effect
  useEffect(() => {
    const interval = setInterval(() => {
      setSheenPosition((prev) => {
        const modulo = Math.max(10, Math.min((renderer?.width || 80) - 4, 100))
        const next = (prev + 1) % modulo
        return next
      })
    }, 150) // Update every 150ms for smooth animation with less CPU usage

    return () => clearInterval(interval)
  }, [])

  // Determine if we're in light mode by checking background color luminance
  const isLightMode = useMemo(
    () => isLightModeColor(theme.background),
    [theme.background],
  )

  // Use pure black/white for logo
  const logoColor = isLightMode ? '#000000' : '#ffffff'

  // Apply sheen effect to a character based on its position
  const applySheenToChar = useCallback(
    (char: string, charIndex: number) => {
      if (char === ' ' || char === '\n') {
        return <span key={charIndex}>{char}</span>
      }

      const color = getSheenColor(char, charIndex, sheenPosition, logoColor)

      return (
        <span key={charIndex} fg={color}>
          {char}
        </span>
      )
    },
    [sheenPosition, logoColor],
  )

  // Memoize logo lines to prevent recalculation
  const logoLines = useMemo(() => parseLogoLines(LOGO), [])

  // Calculate terminal width and height for responsive display
  const terminalWidth = renderer?.width || 80
  const terminalHeight = renderer?.height || 24
  const maxUrlWidth = Math.min(terminalWidth - 10, 100)

  // Responsive breakpoints based on terminal height
  const isVerySmall = terminalHeight < 15 // Minimal UI
  const isSmall = terminalHeight >= 15 && terminalHeight < 20 // Compact UI
  const isMedium = terminalHeight >= 20 && terminalHeight < 30 // Standard UI
  const isLarge = terminalHeight >= 30 // Spacious UI

  // Responsive breakpoints based on terminal width
  const isNarrow = terminalWidth < 60

  // Dynamic spacing based on terminal size
  const containerPadding = isVerySmall ? 1 : isSmall ? 1 : 2
  const headerMarginTop = isVerySmall ? 0 : isSmall ? 1 : isLarge ? 3 : 2
  const headerMarginBottom = isVerySmall ? 1 : isSmall ? 1 : 2
  const sectionMarginBottom = isVerySmall ? 1 : isSmall ? 1 : 2
  const contentMaxWidth = Math.max(10, Math.min(terminalWidth - (containerPadding * 2 + 4), 80))

  const logoDisplayLines = useMemo(
    () => logoLines.map((line) => line.slice(0, contentMaxWidth)),
    [logoLines, contentMaxWidth],
  )

  // Show full logo only on medium+ terminals and when width is sufficient
  const showFullLogo = !isVerySmall && contentMaxWidth >= 60
  // Show any header on very small terminals
  const showHeader = !isVerySmall

  // Format URL for display (wrap if needed)
  return (
    <box
      style={{
        flexDirection: 'column',
        alignItems: 'center',
        width: '100%',
        minHeight: '100%',
        padding: containerPadding,
        backgroundColor: theme.background,
        overflow: 'hidden',
      }}
    >
      {/* Warning banner for invalid credentials */}
      {hasInvalidCredentials && (
        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            width: '100%',
            marginBottom: sectionMarginBottom,
            padding: 1,
            backgroundColor: '#ff0000',
            borderStyle: 'single',
            borderColor: WARNING_COLOR,
            flexShrink: 0,
          }}
        >
            <text wrap={true}>
              <b>
                <span fg={WARNING_COLOR}>
                  ⚠ Invalid Credentials
                </span>
              </b>
            </text>
            <text wrap={true}>
              <span fg={theme.statusSecondary}>
                {isNarrow
                  ? 'Found API key but it\'s invalid. Please log in again.'
                  : 'We found an API key but it appears to be invalid. Please log in again to continue.'}
              </span>
            </text>
        </box>
      )}

      {/* Header - Logo or simple text based on terminal size */}
      {showHeader && (
        <>
          {showFullLogo ? (
            <box
              key="codebuff-logo"
              style={{
                flexDirection: 'column',
                alignItems: 'flex-start',
                marginTop: headerMarginTop,
                marginBottom: headerMarginBottom,
                flexShrink: 0,
              }}
            >
              {logoDisplayLines.map((line, lineIndex) => (
                <text key={`logo-line-${lineIndex}`} wrap={false}>
                  {line
                    .split('')
                    .map((char, charIndex) => applySheenToChar(char, charIndex))}
                </text>
              ))}
            </box>
          ) : (
            <box
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                marginTop: headerMarginTop,
                marginBottom: headerMarginBottom,
                flexShrink: 0,
              }}
            >
              <text wrap={false}>
                <b>
                  <span fg={theme.chromeText}>
                    {isNarrow ? 'Codebuff' : 'Codebuff CLI'}
                  </span>
                </b>
              </text>
            </box>
          )}

          {/* Welcome message - only show on medium+ terminals */}
          {isMedium && !isNarrow && (
            <box
              style={{
                flexDirection: 'column',
                alignItems: 'center',
                marginBottom: sectionMarginBottom,
                maxWidth: contentMaxWidth,
                flexShrink: 0,
              }}
            >
              <text wrap={true}>
                <span fg={theme.chromeText}>Welcome to Codebuff CLI!</span>
              </text>
              {isLarge && (
                <text wrap={true}>
                  <span fg={theme.statusSecondary}>
                    Your AI pair programmer in the terminal
                  </span>
                </text>
              )}
            </box>
          )}
        </>
      )}

      {/* Loading state */}
      {loading && (
        <box
          style={{
            flexDirection: 'column',
            alignItems: 'center',
            flexShrink: 0,
          }}
        >
          <text wrap={false}>
            <span fg={theme.statusSecondary}>Loading...</span>
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
          <text wrap={true}>
            <span fg="red">Error: {error}</span>
          </text>
          {!isVerySmall && (
            <text wrap={true}>
              <span fg={theme.statusSecondary}>
                {isNarrow ? 'Please try again' : 'Please restart the CLI and try again'}
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
          <text wrap={true}>
            <span fg={theme.statusAccent}>
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
          {!isVerySmall && (
            <>
              <text wrap={true}>
                <span fg={theme.chromeText}>
                  {isNarrow ? 'Browser opened!' : 'Opened a browser window to log you in!'}
                </span>
              </text>
              {!isSmall && (
                <text wrap={true}>
                  <span fg={theme.statusSecondary}>
                    {isNarrow
                      ? 'Click link to copy:'
                      : 'If it doesn\'t open automatically, click this link to copy:'}
                  </span>
                </text>
              )}
            </>
          )}
          {loginUrl && (
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
                formatLines={(text, width) =>
                  formatUrl(text, width ?? maxUrlWidth)
                }
                color={hasClickedLink ? LINK_COLOR_CLICKED : LINK_COLOR_DEFAULT}
                activeColor={LINK_COLOR_CLICKED}
                underlineOnHover={true}
                isActive={justCopied}
                onActivate={async () => {

                  try {
                    await open(loginUrl)
                  } catch (err) {
                    logger.error(err, 'Failed to open browser on link click')
                  }
                  return copyToClipboard(loginUrl)
                }}
                containerStyle={{
                  alignItems: 'flex-start',
                  flexShrink: 0,
                }}
              />
            </box>
          )}
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
              <text wrap={false}>
                <span fg={copyMessage.startsWith('✓') ? COPY_SUCCESS_COLOR : COPY_ERROR_COLOR}>
                  {copyMessage}
                </span>
              </text>
            </box>
          )}
        </box>
      )}
    </box>
  )
}
