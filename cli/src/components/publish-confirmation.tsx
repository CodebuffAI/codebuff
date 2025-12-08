import { TextAttributes } from '@opentui/core'
import React, { useMemo } from 'react'

import { useTheme } from '../hooks/use-theme'
import { getSimpleAgentId } from '../utils/agent-id-utils'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { LocalAgentInfo } from '../utils/local-agent-registry'

interface PublishConfirmationProps {
  selectedAgents: LocalAgentInfo[]
  allAgents: LocalAgentInfo[]
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>
  width: number
}

const XS_WIDTH_THRESHOLD = 60
const LIST_MAX_HEIGHT = 6
const STACKED_LIST_HEIGHT = 4
const CONFIRMATION_MAX_HEIGHT = 12

interface AgentListProps {
  title: string
  count: number
  agents: Array<{ id: string; displayName: string }>
  theme: ReturnType<typeof useTheme>
  symbol: string
  symbolColor: string
  textColor: string
  maxHeight: number
}

const AgentList: React.FC<AgentListProps> = ({
  title,
  count,
  agents,
  theme,
  symbol,
  symbolColor,
  textColor,
  maxHeight,
}) => {
  const needsScroll = agents.length > maxHeight

  return (
    <box
      border
      borderStyle="single"
      borderColor={theme.border}
      customBorderChars={BORDER_CHARS}
      style={{
        flexDirection: 'column',
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
      }}
    >
      {/* Header */}
      <box style={{ paddingLeft: 1, paddingRight: 1 }}>
        <text style={{ fg: theme.secondary, attributes: TextAttributes.BOLD }}>
          {title} ({count})
        </text>
      </box>

      {/* Scrollable list */}
      <scrollbox
        scrollX={false}
        scrollbarOptions={{ visible: false }}
        verticalScrollbarOptions={{
          visible: needsScroll,
          trackOptions: { width: 1 },
        }}
        style={{
          height: maxHeight,
          rootOptions: {
            flexDirection: 'row',
            backgroundColor: 'transparent',
          },
          wrapperOptions: {
            border: false,
            backgroundColor: 'transparent',
            flexDirection: 'column',
          },
          contentOptions: {
            flexDirection: 'column',
            gap: 0,
            backgroundColor: 'transparent',
            paddingLeft: 1,
            paddingRight: 1,
          },
        }}
      >
        {agents.map((agent) => {
          const displayText =
            agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName

          return (
            <box key={agent.id} style={{ flexDirection: 'row', gap: 1 }}>
              <text style={{ fg: symbolColor }}>{symbol}</text>
              <text style={{ fg: textColor }}>{displayText}</text>
            </box>
          )
        })}
      </scrollbox>
    </box>
  )
}

export const PublishConfirmation: React.FC<PublishConfirmationProps> = ({
  selectedAgents,
  allAgents,
  agentDefinitions,
  width,
}) => {
  const theme = useTheme()
  const isNarrow = width < XS_WIDTH_THRESHOLD

  // Get all unique agent IDs that will be published (selected + dependencies)
  const allPublishIds = useMemo(() => {
    return getAllPublishAgentIds(selectedAgents, allAgents, agentDefinitions)
  }, [selectedAgents, allAgents, agentDefinitions])

  const selectedIds = new Set(selectedAgents.map((a) => a.id))

  // Separate selected and dependency agents
  const { selectedList, dependencyList } = useMemo(() => {
    const selected: Array<{ id: string; displayName: string }> = []
    const dependencies: Array<{ id: string; displayName: string }> = []

    for (const id of allPublishIds) {
      const agent = allAgents.find((a) => a.id === id)
      const item = {
        id,
        displayName: agent?.displayName ?? id,
      }

      if (selectedIds.has(id)) {
        selected.push(item)
      } else {
        dependencies.push(item)
      }
    }

    return { selectedList: selected, dependencyList: dependencies }
  }, [allPublishIds, allAgents, selectedIds])

  const totalCount = allPublishIds.length

  const needsScroll = (selectedList.length + dependencyList.length) > CONFIRMATION_MAX_HEIGHT

  return (
    <scrollbox
      scrollX={false}
      scrollbarOptions={{ visible: false }}
      verticalScrollbarOptions={{
        visible: needsScroll,
        trackOptions: { width: 1 },
      }}
      style={{
        height: CONFIRMATION_MAX_HEIGHT,
        rootOptions: {
          flexDirection: 'row',
          backgroundColor: 'transparent',
        },
        wrapperOptions: {
          border: false,
          backgroundColor: 'transparent',
          flexDirection: 'column',
        },
        contentOptions: {
          flexDirection: 'column',
          gap: 1,
          backgroundColor: 'transparent',
        },
      }}
    >
      <text style={{ fg: theme.foreground, attributes: TextAttributes.BOLD }}>
        Ready to publish {totalCount} agent{totalCount !== 1 ? 's' : ''}:
      </text>

      {/* Two-column layout (or stacked for narrow terminals) */}
      <box
        style={{
          flexDirection: isNarrow ? 'column' : 'row',
          gap: 1,
        }}
      >
        {/* Selected agents */}
        <AgentList
          title="Selected"
          count={selectedList.length}
          agents={selectedList}
          theme={theme}
          symbol="✓"
          symbolColor={theme.success}
          textColor={theme.foreground}
          maxHeight={isNarrow ? STACKED_LIST_HEIGHT : LIST_MAX_HEIGHT}
        />

        {/* Dependencies (only show if there are any) */}
        {dependencyList.length > 0 && (
          <AgentList
            title="Dependencies"
            count={dependencyList.length}
            agents={dependencyList}
            theme={theme}
            symbol="+"
            symbolColor={theme.muted}
            textColor={theme.muted}
            maxHeight={isNarrow ? STACKED_LIST_HEIGHT : LIST_MAX_HEIGHT}
          />
        )}
      </box>
    </scrollbox>
  )
}

// Export helper to get all agent IDs for publishing (recursive)
export function getAllPublishAgentIds(
  selectedAgents: LocalAgentInfo[],
  allAgents: LocalAgentInfo[],
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>,
): string[] {
  // Build set of all known local agent IDs from both sources
  // This ensures we catch agents that are in definitions but might not be in the UI list
  const localAgentIds = new Set([
    ...allAgents.map((a) => a.id),
    ...agentDefinitions.keys(),
  ])
  const result = new Set<string>()

  // Recursive helper to collect all dependencies
  function collectDependencies(agentId: string) {
    if (result.has(agentId)) return
    if (!localAgentIds.has(agentId)) return

    result.add(agentId)

    const definition = agentDefinitions.get(agentId)
    const spawnableAgents = definition?.spawnableAgents ?? []

    for (const spawnableId of spawnableAgents) {
      const simpleId = getSimpleAgentId(spawnableId)
      collectDependencies(simpleId)
    }
  }

  for (const agent of selectedAgents) {
    collectDependencies(agent.id)
  }

  return Array.from(result)
}
