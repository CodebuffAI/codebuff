import os from 'os'
import path from 'path'

import { pluralize } from '@codebuff/common/util/string'
import { useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { Chat } from './chat'
import { LoginModal } from './components/login-modal'
import { TerminalLink } from './components/terminal-link'
import { ToolCallItem } from './components/tools/tool-call-item'
import { useAuthState } from './hooks/use-auth-state'
import { useLogo } from './hooks/use-logo'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTheme } from './hooks/use-theme'
import { getProjectRoot } from './project-files'
import { useChatStore } from './state/chat-store'
import { createValidationErrorBlocks } from './utils/create-validation-error-blocks'
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
  const { setInputFocused, resetChatStore } = useChatStore(
    useShallow((store) => ({
      setInputFocused: store.setInputFocused,
      resetChatStore: store.reset,
    })),
  )

  const { isAuthenticated, handleLoginSuccess, logout } = useAuthState({
    requireAuth,
    hasInvalidCredentials,
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
        {validationErrors.length > 0 && (
          <box style={{ flexDirection: 'column', gap: 0 }}>
            {createValidationErrorBlocks({
              errors: validationErrors,
              loadedAgentsData,
              availableWidth: separatorWidth,
            }).map((block, idx) => {
              if (block.type === 'html') {
                return (
                  <box key={`validation-error-${idx}`}>
                    {block.render({ textColor: theme.foreground, theme })}
                  </box>
                )
              }
              return null
            })}
          </box>
        )}
      </box>
    )
  }, [
    loadedAgentsData,
    logoBlock,
    theme,
    isAgentListCollapsed,
    validationErrors,
    separatorWidth,
  ])

  // Render login modal when not authenticated, otherwise render chat
  if (requireAuth !== null && isAuthenticated === false) {
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
      continueChat={continueChat}
      continueChatId={continueChatId}
      logout={logout}
    />
  )
}
