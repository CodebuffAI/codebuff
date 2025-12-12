import os from 'os'
import path from 'path'

import { NetworkError, RETRYABLE_ERROR_CODES } from '@codebuff/sdk'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Chat } from './chat'
import { LoginModal } from './components/login-modal'
import { TerminalLink } from './components/terminal-link'
import { useAuthQuery } from './hooks/use-auth-query'
import { useAuthState } from './hooks/use-auth-state'
import { useLogo } from './hooks/use-logo'
import { useSheenAnimation } from './hooks/use-sheen-animation'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTerminalFocus } from './hooks/use-terminal-focus'
import { useTheme } from './hooks/use-theme'
import { getProjectRoot } from './project-files'
import { useChatStore } from './state/chat-store'
import { openFileAtPath } from './utils/open-file'

import type { MultilineInputHandle } from './components/multiline-input'
import type { AuthStatus } from './utils/status-indicator-state'
import type { AgentMode } from './utils/constants'
import type { FileTreeNode } from '@codebuff/common/util/file'

interface AppProps {
  initialPrompt: string | null
  agentId?: string
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  fileTree: FileTreeNode[]
  continueChat: boolean
  continueChatId?: string
  initialMode?: AgentMode
}

export const App = ({
  initialPrompt,
  agentId,
  requireAuth,
  hasInvalidCredentials,
  fileTree,
  continueChat,
  continueChatId,
  initialMode,
}: AppProps) => {
  const { contentMaxWidth, terminalWidth } = useTerminalDimensions()
  const theme = useTheme()

  // Sheen animation state for the logo
  const [sheenPosition, setSheenPosition] = useState(0)
  const blockColor = theme.name === 'dark' ? '#ffffff' : '#000000'
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    accentColor: theme.primary,
    blockColor,
    terminalWidth,
    sheenPosition,
    setSheenPosition,
  })

  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    accentColor: theme.primary,
    blockColor,
    applySheenToChar,
  })

  const inputRef = useRef<MultilineInputHandle | null>(null)
  const { setInputFocused, setIsFocusSupported, resetChatStore } = useChatStore(
    useShallow((store) => ({
      setInputFocused: store.setInputFocused,
      setIsFocusSupported: store.setIsFocusSupported,
      resetChatStore: store.reset,
    })),
  )

  // Wrap in useCallback to prevent re-subscribing on every render
  const handleSupportDetected = useCallback(() => {
    setIsFocusSupported(true)
  }, [setIsFocusSupported])

  // Enable terminal focus detection to stop cursor blinking when window loses focus
  // Cursor starts visible but not blinking; blinking enabled once terminal support confirmed
  useTerminalFocus({
    onFocusChange: setInputFocused,
    onSupportDetected: handleSupportDetected,
  })

  // Get auth query for network status tracking
  const authQuery = useAuthQuery()

  const {
    isAuthenticated,
    setIsAuthenticated,
    setUser,
    handleLoginSuccess,
    logoutMutation,
  } = useAuthState({
    requireAuth,
    inputRef,
    setInputFocused,
    resetChatStore,
  })

  const headerContent = useMemo(() => {
    const homeDir = os.homedir()
    const repoRoot = getProjectRoot()
    const relativePath = path.relative(homeDir, repoRoot)
    const displayPath = relativePath.startsWith('..')
      ? repoRoot
      : `~/${relativePath}`

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <box
          style={{
            flexDirection: 'column',
            marginBottom: 1,
            marginTop: 2,
          }}
        >
          {logoComponent}
        </box>
        <text
          style={{ wrapMode: 'word', marginBottom: 1, fg: theme.foreground }}
        >
          Codebuff will run commands on your behalf to help you build.
        </text>
        <text
          style={{ wrapMode: 'word', marginBottom: 1, fg: theme.foreground }}
        >
          Directory{' '}
          <TerminalLink
            text={displayPath}
            inline={true}
            underlineOnHover={true}
            onActivate={() => openFileAtPath(repoRoot)}
          />
        </text>
      </box>
    )
  }, [logoComponent, theme])

  // Derive auth reachability + retrying state inline from authQuery error
  const authError = authQuery.error
  const networkError =
    authError && authError instanceof NetworkError ? authError : null
  const isRetryableNetworkError = Boolean(
    networkError && RETRYABLE_ERROR_CODES.has(networkError.code),
  )

  let authStatus: AuthStatus = 'ok'
  if (authQuery.isError) {
    if (!networkError) {
      authStatus = 'ok'
    } else if (isRetryableNetworkError) {
      authStatus = 'retrying'
    } else {
      authStatus = 'unreachable'
    }
  }

  // Render login modal when not authenticated AND auth service is reachable
  // Don't show login modal during network outages OR while retrying
  if (
    requireAuth !== null &&
    isAuthenticated === false &&
    authStatus === 'ok'
  ) {
    return (
      <LoginModal
        onLoginSuccess={handleLoginSuccess}
        hasInvalidCredentials={hasInvalidCredentials}
      />
    )
  }

  return (
    <Chat
      headerContent={headerContent}
      initialPrompt={initialPrompt}
      agentId={agentId}
      fileTree={fileTree}
      inputRef={inputRef}
      setIsAuthenticated={setIsAuthenticated}
      setUser={setUser}
      logoutMutation={logoutMutation}
      continueChat={continueChat}
      continueChatId={continueChatId}
      authStatus={authStatus}
      initialMode={initialMode}
    />
  )
}
