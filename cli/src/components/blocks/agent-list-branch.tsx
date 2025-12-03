import { pluralize } from '@codebuff/common/util/string'
import { memo, useCallback } from 'react'

import { useTheme } from '../../hooks/use-theme'
import { ToolCallItem } from '../tools/tool-call-item'

import type { ContentBlock } from '../../types/chat'

interface AgentListBranchProps {
  agentListBlock: Extract<ContentBlock, { type: 'agent-list' }>
  keyPrefix: string
  onToggleCollapsed: (id: string) => void
}

export const AgentListBranch = memo(
  ({ agentListBlock, keyPrefix, onToggleCollapsed }: AgentListBranchProps) => {
    const theme = useTheme()
    const isCollapsed = agentListBlock.isCollapsed ?? true
    const { agents } = agentListBlock

    const sortedAgents = [...agents].sort((a, b) => {
      const displayNameComparison = (a.displayName || '')
        .toLowerCase()
        .localeCompare((b.displayName || '').toLowerCase())

      return (
        displayNameComparison ||
        a.id.toLowerCase().localeCompare(b.id.toLowerCase())
      )
    })

    const agentCount = sortedAgents.length

    const formatIdentifier = useCallback(
      (agent: { id: string; displayName: string }) =>
        agent.displayName && agent.displayName !== agent.id
          ? `${agent.displayName} (${agent.id})`
          : agent.displayName || agent.id,
      [],
    )

    const headerText = pluralize(agentCount, 'local agent')

    const handleToggle = useCallback(() => {
      onToggleCollapsed(agentListBlock.id)
    }, [onToggleCollapsed, agentListBlock.id])

    return (
      <box key={keyPrefix}>
        <ToolCallItem
          name={headerText}
          content={
            <box style={{ flexDirection: 'column', gap: 0 }}>
              {sortedAgents.map((agent, idx) => {
                const identifier = formatIdentifier(agent)
                return (
                  <text
                    key={`agent-${idx}`}
                    style={{ wrapMode: 'word', fg: theme.foreground }}
                  >
                    {`• ${identifier}`}
                  </text>
                )
              })}
            </box>
          }
          isCollapsed={isCollapsed}
          isStreaming={false}
          streamingPreview=""
          finishedPreview=""
          onToggle={handleToggle}
          dense
        />
      </box>
    )
  },
)
