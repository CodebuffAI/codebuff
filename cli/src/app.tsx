import os from 'os'
import path from 'path'

import { pluralize } from '@codebuff/common/util/string'
import { useCallback, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Chat } from './chat'
import { LoginModal } from './components/login-modal'
import { TerminalLink } from './components/terminal-link'
import { ToolCallItem } from './components/tools/tool-call-item'
import { useAgentValidation } from './hooks/use-agent-validation'
import { useAuthQuery } from './hooks/use-auth-query'
import { useAuthState } from './hooks/use-auth-state'
import { useLogo } from './hooks/use-logo'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTerminalFocus } from './hooks/use-terminal-focus'
import { useTheme } from './hooks/use-theme'
import { NetworkError, RETRYABLE_ERROR_CODES } from '@codebuff/sdk'
import type { AuthStatus } from './utils/status-indicator-state'
import { getProjectRoot } from './project-files'
import { useChatStore } from './state/chat-store'
import { openFileAtPath } from './utils/open-file'

import type { MultilineInputHandle } from './components/multiline-input'
import type { FileTreeNode } from '@codebuff/common/util/file'

interface AppProps {
  initialPrompt: string | null
  agentId?: string
  requireAuth: boolean | null
  hasInvalidCredentials: boolean
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  validationErrors: Array<{ id: string; message: string }>
  fileTree: FileTreeNode[]
  continueChat: boolean
  continueChatId?: string
}

export const App = ({
  initialPrompt,
  agentId,
  requireAuth,
  hasInvalidCredentials,
  loadedAgentsData,
  validationErrors,
  fileTree,
  continueChat,
  continueChatId,
}: AppProps) => {
  const { contentMaxWidth, separatorWidth } = useTerminalDimensions()
  const theme = useTheme()
  const { textBlock: logoBlock } = useLogo({ availableWidth: contentMaxWidth })

  const [isAgentListCollapsed, setIsAgentListCollapsed] = useState(true)
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
    hasInvalidCredentials,
    inputRef,
    setInputFocused,
    resetChatStore,
  })

  // Agent validation
  const { validate: validateAgents } = useAgentValidation(validationErrors)

  const headerContent = useMemo(() => {
    const homeDir = os.homedir()
    const repoRoot = getProjectRoot()
    const relativePath = path.relative(homeDir, repoRoot)
    const displayPath = relativePath.startsWith('..')
      ? repoRoot
      : `~/${relativePath}`

    const sortedAgents = loadedAgentsData
      ? [...loadedAgentsData.agents].sort((a, b) => {
          const displayNameComparison = (a.displayName || '')
            .toLowerCase()
            .localeCompare((b.displayName || '').toLowerCase())

          return (
            displayNameComparison ||
            a.id.toLowerCase().localeCompare(b.id.toLowerCase())
          )
        })
      : null

    const agentCount = sortedAgents?.length

    const formatIdentifier = (agent: { id: string; displayName: string }) =>
      agent.displayName && agent.displayName !== agent.id
        ? `${agent.displayName} (${agent.id})`
        : agent.displayName || agent.id

    const renderAgentListItem = (
      agent: { id: string; displayName: string },
      idx: number,
    ) => {
      const identifier = formatIdentifier(agent)
      return (
        <text
          key={`agent-${idx}`}
          style={{ wrapMode: 'word', fg: theme.foreground }}
        >
          {`• ${identifier}`}
        </text>
      )
    }

    const agentListContent = sortedAgents ? (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {sortedAgents.map(renderAgentListItem)}
      </box>
    ) : null

    const headerText = agentCount ? pluralize(agentCount, 'local agent') : null

    return (
      <box
        style={{
          flexDirection: 'column',
          gap: 0,
          paddingLeft: 1,
          paddingRight: 1,
        }}
      >
        <text
          style={{
            wrapMode: 'word',
            marginBottom: 1,
            marginTop: 2,
            fg: theme.foreground,
          }}
        >
          {logoBlock}
        </text>
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
        {headerText ? (
          <box style={{ marginBottom: 1 }}>
            <ToolCallItem
              name={headerText}
              content={agentListContent}
              isCollapsed={isAgentListCollapsed}
              isStreaming={false}
              streamingPreview=""
              finishedPreview=""
              onToggle={() => setIsAgentListCollapsed(!isAgentListCollapsed)}
              dense
            />
          </box>
        ) : null}
      </box>
    )
  }, [
    loadedAgentsData,
    logoBlock,
    theme,
    isAgentListCollapsed,
  ])

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
      loadedAgentsData={loadedAgentsData}
      validationErrors={validationErrors}
      fileTree={fileTree}
      inputRef={inputRef}
      setIsAuthenticated={setIsAuthenticated}
      setUser={setUser}
      logoutMutation={logoutMutation}
      continueChat={continueChat}
      continueChatId={continueChatId}
      authStatus={authStatus}
    />
  )
}
