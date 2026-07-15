import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { useMemo, useRef, useEffect, useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { getSimpleAgentId } from '../utils/agent-id-utils'

import type { LocalAgentInfo } from '../utils/local-agent-registry'
import type { ScrollBoxRenderable } from '@opentui/core'

const SYMBOLS = {
  CHECKBOX_CHECKED: '☑',
  CHECKBOX_UNCHECKED: '☐',
} as const

// Recursively count local dependencies for an agent
function countDependencies(
  agentId: string,
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>,
  localAgentIds: Set<string>,
  visited: Set<string>,
): number {
  if (visited.has(agentId)) return 0
  visited.add(agentId)

  const definition = agentDefinitions.get(agentId)
  const spawnableAgents = definition?.spawnableAgents ?? []

  let count = 0
  for (const spawnableId of spawnableAgents) {
    const simpleId = getSimpleAgentId(spawnableId)
    if (localAgentIds.has(simpleId) && !visited.has(simpleId)) {
      count +=
        1 +
        countDependencies(simpleId, agentDefinitions, localAgentIds, visited)
    }
  }

  return count
}

// Build dependency tree for an agent
interface DepTreeNode {
  id: string
  displayName: string
  children: DepTreeNode[]
}

function buildDepTree(
  agentId: string,
  agents: LocalAgentInfo[],
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>,
  localAgentIds: Set<string>,
  ancestorIds: Set<string>,
): DepTreeNode[] {
  const definition = agentDefinitions.get(agentId)
  const spawnableAgents = definition?.spawnableAgents ?? []

  const newAncestorIds = new Set(ancestorIds)
  newAncestorIds.add(agentId)

  const children: DepTreeNode[] = []
  for (const spawnableId of spawnableAgents) {
    const simpleId = getSimpleAgentId(spawnableId)
    if (localAgentIds.has(simpleId) && !newAncestorIds.has(simpleId)) {
      const agent = agents.find((a) => a.id === simpleId)
      if (agent) {
        children.push({
          id: agent.id,
          displayName: agent.displayName,
          children: buildDepTree(
            simpleId,
            agents,
            agentDefinitions,
            localAgentIds,
            newAncestorIds,
          ),
        })
      }
    }
  }

  return children
}

export type VisibleAgentRow =
  | { kind: 'agent'; key: string; agent: LocalAgentInfo }
  | {
      kind: 'dependency'
      key: string
      agentId: string
      displayName: string
      depth: number
      isLast: boolean
    }

function flattenDepTree(
  nodes: DepTreeNode[],
  parentKey: string,
  depth = 0,
): VisibleAgentRow[] {
  return nodes.flatMap((node, index) => {
    const key = `${parentKey}/${node.id}:${index}`
    return [
      {
        kind: 'dependency' as const,
        key,
        agentId: node.id,
        displayName: node.displayName,
        depth,
        isLast: index === nodes.length - 1,
      },
      ...flattenDepTree(node.children, key, depth + 1),
    ]
  })
}

export function buildVisibleAgentRows(params: {
  allAgents: LocalAgentInfo[]
  filteredAgents: LocalAgentInfo[]
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>
  expandedAgentIds: Set<string>
}): VisibleAgentRow[] {
  const localAgentIds = new Set(params.allAgents.map((agent) => agent.id))
  return params.filteredAgents.flatMap((agent): VisibleAgentRow[] => [
    { kind: 'agent', key: agent.id, agent },
    ...(params.expandedAgentIds.has(agent.id)
      ? flattenDepTree(
          buildDepTree(
            agent.id,
            params.allAgents,
            params.agentDefinitions,
            localAgentIds,
            new Set(),
          ),
          agent.id,
        )
      : []),
  ])
}

interface AgentChecklistProps {
  /** All agents (used for dependency tree calculations) */
  allAgents: LocalAgentInfo[]
  /** Agents filtered by search query (displayed in the list) */
  filteredAgents: LocalAgentInfo[]
  selectedIds: Set<string>
  searchQuery: string
  focusedIndex: number
  onToggleAgent: (agentId: string) => void
  onFocusChange: (index: number) => void
  onVisibleRowsChange?: (agentIds: string[]) => void
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>
  maxHeight?: number
}

export const AgentChecklist: React.FC<AgentChecklistProps> = ({
  allAgents,
  filteredAgents,
  selectedIds,
  searchQuery,
  focusedIndex,
  onToggleAgent,
  onFocusChange,
  onVisibleRowsChange,
  agentDefinitions,
  maxHeight = 8,
}) => {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(
    new Set(),
  )
  const [hoveredSubagentLink, setHoveredSubagentLink] = useState<string | null>(
    null,
  )

  // Precompute local agent IDs for dependency calculations
  const localAgentIds = useMemo(
    () => new Set(allAgents.map((a) => a.id)),
    [allAgents],
  )

  // Calculate dependency count for each agent
  const dependencyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const agent of allAgents) {
      const count = countDependencies(
        agent.id,
        agentDefinitions,
        localAgentIds,
        new Set(),
      )
      counts.set(agent.id, count)
    }
    return counts
  }, [allAgents, agentDefinitions, localAgentIds])

  const visibleRows = useMemo(
    () =>
      buildVisibleAgentRows({
        allAgents,
        filteredAgents,
        agentDefinitions,
        expandedAgentIds,
      }),
    [agentDefinitions, allAgents, expandedAgentIds, filteredAgents],
  )

  useEffect(() => {
    onVisibleRowsChange?.(
      visibleRows.map((row) =>
        row.kind === 'agent' ? row.agent.id : row.agentId,
      ),
    )
    if (focusedIndex >= visibleRows.length) {
      onFocusChange(Math.max(0, visibleRows.length - 1))
    }
  }, [focusedIndex, onFocusChange, onVisibleRowsChange, visibleRows])

  // Toggle expansion of an agent's dependencies
  const toggleExpanded = (agentId: string) => {
    setExpandedAgentIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  // Scroll focused item into view when focus changes via keyboard
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox || visibleRows.length === 0) return

    const itemHeight = 1
    const focusedTop = Math.max(0, focusedIndex) * itemHeight
    const focusedBottom = focusedTop + itemHeight

    const viewportHeight = scrollbox.viewport.height
    const currentScroll = scrollbox.scrollTop

    // Scroll up if focused item is above viewport
    if (focusedTop < currentScroll) {
      scrollbox.scrollTop = focusedTop
    }
    // Scroll down if focused item is below viewport
    else if (focusedBottom > currentScroll + viewportHeight) {
      scrollbox.scrollTop = focusedBottom - viewportHeight
    }
  }, [focusedIndex, visibleRows.length])

  if (filteredAgents.length === 0) {
    return (
      <box style={{ paddingLeft: 1, paddingTop: 1 }}>
        <text style={{ fg: theme.muted, attributes: TextAttributes.ITALIC }}>
          {searchQuery ? 'No agents match your search' : 'No agents available'}
        </text>
      </box>
    )
  }

  const needsScroll = visibleRows.length > maxHeight

  return (
    <box style={{ flexDirection: 'column', gap: 0 }}>
      <scrollbox
        ref={scrollRef}
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
          },
        }}
      >
        {visibleRows.map((row, rowIndex) => {
          if (row.kind === 'dependency') {
            const isSelected = selectedIds.has(row.agentId)
            const isFocused = rowIndex === focusedIndex
            const symbol = isSelected
              ? SYMBOLS.CHECKBOX_CHECKED
              : SYMBOLS.CHECKBOX_UNCHECKED
            const displayText =
              row.displayName !== row.agentId
                ? `${row.displayName} (${row.agentId})`
                : row.displayName
            return (
              <Button
                key={row.key}
                onClick={() => {
                  onFocusChange(rowIndex)
                  onToggleAgent(row.agentId)
                }}
                style={{
                  flexDirection: 'row',
                  gap: 1,
                  backgroundColor: isFocused ? theme.surface : 'transparent',
                  paddingLeft: row.depth * 3 + 3,
                  paddingRight: 1,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              >
                <text style={{ fg: theme.muted }}>
                  {row.isLast ? '└─' : '├─'}
                </text>
                <text
                  style={{
                    fg: isSelected
                      ? theme.success
                      : isFocused
                        ? theme.foreground
                        : theme.muted,
                    attributes: isFocused ? TextAttributes.BOLD : undefined,
                  }}
                >
                  {symbol} {displayText}
                </text>
              </Button>
            )
          }

          const { agent } = row
          const idx = rowIndex
          const isSelected = selectedIds.has(agent.id)
          const isFocused = idx === focusedIndex
          const isHovered = idx === hoveredIndex
          const isHighlighted = isFocused || isHovered
          const depCount = dependencyCounts.get(agent.id) ?? 0
          const isExpanded = expandedAgentIds.has(agent.id)
          const isSubagentLinkHovered = hoveredSubagentLink === agent.id
          const subagentLabel = `(${isExpanded ? '-' : '+'} ${pluralize(depCount, 'subagent')})`

          const symbol = isSelected
            ? SYMBOLS.CHECKBOX_CHECKED
            : SYMBOLS.CHECKBOX_UNCHECKED

          const displayText =
            agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName

          return (
            <React.Fragment key={row.key}>
              <box
                style={{
                  flexDirection: 'row',
                  gap: 1,
                  backgroundColor: isHighlighted ? theme.surface : undefined,
                  paddingLeft: 1,
                  paddingRight: 1,
                  paddingTop: 0,
                  paddingBottom: 0,
                }}
              >
                {/* Checkbox and agent name - clickable to toggle selection */}
                <Button
                  onClick={() => {
                    onFocusChange(idx)
                    onToggleAgent(agent.id)
                  }}
                  onMouseOver={() => setHoveredIndex(idx)}
                  onMouseOut={() => setHoveredIndex(null)}
                  style={{
                    flexDirection: 'row',
                    gap: 1,
                    backgroundColor: 'transparent',
                    paddingLeft: 0,
                    paddingRight: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                >
                  <text
                    style={{
                      fg: isSelected
                        ? theme.success
                        : isHighlighted
                          ? theme.foreground
                          : theme.muted,
                      attributes: isHighlighted
                        ? TextAttributes.BOLD
                        : undefined,
                    }}
                  >
                    {symbol}
                  </text>
                  <text
                    style={{
                      fg: isSelected
                        ? theme.success
                        : isHighlighted
                          ? theme.foreground
                          : theme.muted,
                      attributes: isHighlighted
                        ? TextAttributes.BOLD
                        : undefined,
                    }}
                  >
                    {displayText}
                  </text>
                </Button>

                {/* Subagent count - clickable to expand/collapse */}
                {depCount > 0 && (
                  <Button
                    onClick={() => toggleExpanded(agent.id)}
                    onMouseOver={() => setHoveredSubagentLink(agent.id)}
                    onMouseOut={() => setHoveredSubagentLink(null)}
                    style={{
                      backgroundColor: 'transparent',
                      paddingLeft: 0,
                      paddingRight: 0,
                      paddingTop: 0,
                      paddingBottom: 0,
                    }}
                  >
                    <text
                      style={{
                        fg: theme.secondary,
                        attributes: isSubagentLinkHovered
                          ? TextAttributes.UNDERLINE
                          : undefined,
                      }}
                    >
                      {subagentLabel}
                    </text>
                  </Button>
                )}
              </box>
            </React.Fragment>
          )
        })}
      </scrollbox>
    </box>
  )
}
