import os from 'os'
import path from 'path'

import { useMemo, useState } from 'react'

import { Chat } from './chat'
import { TerminalLink } from './components/terminal-link'
import { ToolCallItem } from './components/tools/tool-call-item'
import { useLogo } from './hooks/use-logo'
import { useTerminalDimensions } from './hooks/use-terminal-dimensions'
import { useTheme } from './hooks/use-theme'
import { createValidationErrorBlocks } from './utils/create-validation-error-blocks'
import { openFileAtPath } from './utils/open-file'
import { pluralize } from '@codebuff/common/util/string'

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
}

export const App = ({
  initialPrompt,
  agentId,
  requireAuth,
  hasInvalidCredentials,
  loadedAgentsData,
  validationErrors,
}: AppProps) => {
  const { contentMaxWidth, separatorWidth } = useTerminalDimensions()
  const theme = useTheme()
  const { textBlock: logoBlock } = useLogo({ availableWidth: contentMaxWidth })

  const [isAgentListCollapsed, setIsAgentListCollapsed] = useState(true)

  const headerContent = useMemo(() => {
    if (!loadedAgentsData) {
      return null
    }

    const homeDir = os.homedir()
    const repoRoot = path.dirname(loadedAgentsData.agentsDir)
    const relativePath = path.relative(homeDir, repoRoot)
    const displayPath = relativePath.startsWith('..')
      ? repoRoot
      : `~/${relativePath}`

    const sortedAgents = [...loadedAgentsData.agents].sort((a, b) => {
      const displayNameComparison = (a.displayName || '')
        .toLowerCase()
        .localeCompare((b.displayName || '').toLowerCase())

      return (
        displayNameComparison ||
        a.id.toLowerCase().localeCompare(b.id.toLowerCase())
      )
    })

    const agentCount = sortedAgents.length

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

    const agentListContent = (
      <box style={{ flexDirection: 'column', gap: 0 }}>
        {sortedAgents.map(renderAgentListItem)}
      </box>
    )

    const headerText = pluralize(agentCount, 'local agent')

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

  return (
    <Chat
      headerContent={headerContent}
      initialPrompt={initialPrompt}
      agentId={agentId}
      requireAuth={requireAuth}
      hasInvalidCredentials={hasInvalidCredentials}
      loadedAgentsData={loadedAgentsData}
      validationErrors={validationErrors}
    />
  )
}
