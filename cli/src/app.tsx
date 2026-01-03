import { isRetryableStatusCode, getErrorStatusCode } from '@codebuff/sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Chat } from './chat'
import { LoginModal } from './components/login-modal'
import { ProjectPickerScreen } from './components/project-picker-screen'
import { TerminalLink } from './components/terminal-link'
import { useAuthQuery } from './hooks/use-auth-query'
import { useAuthState } from './hooks/use-auth-state'
import { useLogo } from './hooks/use-logo'
import { useSheenAnimation } from './hooks/use-sheen-animation'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTerminalFocus } from './hooks/use-terminal-focus'
import { useTheme } from './hooks/use-theme'
import { getProjectRoot } from './project-files'
import { useChatStore, type TopBannerType } from './state/chat-store'
import { openFileAtPath } from './utils/open-file'
import { formatCwd } from './utils/path-helpers'
import { findGitRoot } from './utils/git'
import { getLogoBlockColor, getLogoAccentColor } from './utils/theme-system'

import type { MultilineInputHandle } from './components/multiline-input'
import type { AgentMode } from './utils/constants'
import type { AuthStatus } from './utils/status-indicator-state'
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
  showProjectPicker: boolean
  onProjectChange: (projectPath: string) => void
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
  showProjectPicker,
  onProjectChange,
}: AppProps) => {
  const { contentMaxWidth, terminalWidth } = useTerminalDimensions()
  const theme = useTheme()

  // Sheen animation state for the logo
  const [sheenPosition, setSheenPosition] = useState(0)
  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const { applySheenToChar } = useSheenAnimation({
    logoColor: theme.foreground,
    accentColor,
    blockColor,
    terminalWidth,
    sheenPosition,
    setSheenPosition,
  })

  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    accentColor,
    blockColor,
    applySheenToChar,
  })

  const inputRef = useRef<MultilineInputHandle | null>(null)
  const {
    setInputFocused,
    setIsFocusSupported,
    resetChatStore,
    activeTopBanner,
    setActiveTopBanner,
    closeTopBanner,
  } = useChatStore(
    useShallow((store) => ({
      setInputFocused: store.setInputFocused,
      setIsFocusSupported: store.setIsFocusSupported,
      resetChatStore: store.reset,
      activeTopBanner: store.activeTopBanner,
      setActiveTopBanner: store.setActiveTopBanner,
      closeTopBanner: store.closeTopBanner,
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

  const projectRoot = getProjectRoot()
  const gitRoot = useMemo(
    () => findGitRoot({ cwd: projectRoot }),
    [projectRoot],
  )
  const showGitRootBanner = Boolean(gitRoot && gitRoot !== projectRoot)
  const [gitRootBannerDismissed, setGitRootBannerDismissed] = useState(false)
  const prevTopBannerRef = useRef<TopBannerType | null>(null)

  useEffect(() => {
    setGitRootBannerDismissed(false)
  }, [projectRoot])

  useEffect(() => {
    const prevBanner = prevTopBannerRef.current
    if (
      prevBanner === 'gitRoot' &&
      activeTopBanner === null &&
      showGitRootBanner
    ) {
      setGitRootBannerDismissed(true)
    }
    prevTopBannerRef.current = activeTopBanner
  }, [activeTopBanner, showGitRootBanner])

  useEffect(() => {
    if (!showGitRootBanner) {
      if (activeTopBanner === 'gitRoot') {
        closeTopBanner()
      }
      return
    }
    if (!gitRootBannerDismissed && activeTopBanner === null) {
      setActiveTopBanner('gitRoot')
    }
  }, [
    activeTopBanner,
    closeTopBanner,
    gitRootBannerDismissed,
    setActiveTopBanner,
    showGitRootBanner,
  ])

  const handleSwitchToGitRoot = useCallback(() => {
    if (gitRoot) {
      onProjectChange(gitRoot)
    }
  }, [gitRoot, onProjectChange])

  const headerContent = useMemo(() => {
    const displayPath = formatCwd(projectRoot)

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
            color={theme.muted}
            inline={true}
            underlineOnHover={true}
            onActivate={() => openFileAtPath(projectRoot)}
          />
        </text>
      </box>
    )
  }, [logoComponent, projectRoot, theme])

  // Derive auth reachability + retrying state from authQuery error
  const authError = authQuery.error
  const authErrorStatusCode = authError ? getErrorStatusCode(authError) : undefined

  let authStatus: AuthStatus = 'ok'
  if (authQuery.isError && authErrorStatusCode !== undefined) {
    if (isRetryableStatusCode(authErrorStatusCode)) {
      // Retryable errors (408 timeout, 429 rate limit, 5xx server errors)
      authStatus = 'retrying'
    } else if (authErrorStatusCode >= 500) {
      // Non-retryable server errors (unlikely but possible future codes)
      authStatus = 'unreachable'
    }
    // 4xx client errors (401, 403, etc.) keep 'ok' - network is fine, just auth failed
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

  // Render project picker when at home directory or outside a project
  if (showProjectPicker) {
    return (
      <ProjectPickerScreen
        onSelectProject={onProjectChange}
        initialPath={projectRoot}
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
      gitRoot={gitRoot}
      onSwitchToGitRoot={handleSwitchToGitRoot}
    />
  )
}
