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
      count += 1 + countDependencies(simpleId, agentDefinitions, localAgentIds, visited)
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
          children: buildDepTree(simpleId, agents, agentDefinitions, localAgentIds, newAncestorIds),
        })
      }
    }
  }

  return children
}

// Render dependency tree recursively
const DepTree: React.FC<{
  nodes: DepTreeNode[]
  depth: number
  theme: ReturnType<typeof useTheme>
}> = ({ nodes, depth, theme }) => {
  return (
    <>
      {nodes.map((node, idx) => {
        const isLast = idx === nodes.length - 1
        const prefix = isLast ? '└─' : '├─'
        const displayText =
          node.displayName !== node.id
            ? `${node.displayName} (${node.id})`
            : node.displayName

        return (
          <React.Fragment key={node.id}>
            <box style={{ flexDirection: 'row', gap: 1, paddingLeft: depth * 3 + 3 }}>
              <text style={{ fg: theme.muted }}>{prefix}</text>
              <text style={{ fg: theme.muted }}>{displayText}</text>
            </box>
            {node.children.length > 0 && (
              <DepTree nodes={node.children} depth={depth + 1} theme={theme} />
            )}
          </React.Fragment>
        )
      })}
    </>
  )
}

interface AgentChecklistProps {
  agents: LocalAgentInfo[]
  selectedIds: Set<string>
  searchQuery: string
  focusedIndex: number
  onToggleAgent: (agentId: string) => void
  onFocusChange: (index: number) => void
  agentDefinitions: Map<string, { spawnableAgents?: string[] }>
  maxHeight?: number
}

export const AgentChecklist: React.FC<AgentChecklistProps> = ({
  agents,
  selectedIds,
  searchQuery,
  focusedIndex,
  onToggleAgent,
  onFocusChange,
  agentDefinitions,
  maxHeight = 8,
}) => {
  const theme = useTheme()
  const scrollRef = useRef<ScrollBoxRenderable | null>(null)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [expandedAgentIds, setExpandedAgentIds] = useState<Set<string>>(new Set())
  const [hoveredSubagentLink, setHoveredSubagentLink] = useState<string | null>(null)

  // Precompute local agent IDs for dependency calculations
  const localAgentIds = useMemo(() => new Set(agents.map((a) => a.id)), [agents])

  // Calculate dependency count for each agent
  const dependencyCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const agent of agents) {
      const count = countDependencies(agent.id, agentDefinitions, localAgentIds, new Set())
      counts.set(agent.id, count)
    }
    return counts
  }, [agents, agentDefinitions, localAgentIds])

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

  // Filter agents based on search query (instant filter)
  const filteredAgents = useMemo(() => {
    if (!searchQuery.trim()) {
      return agents
    }
    const query = searchQuery.toLowerCase()
    return agents.filter(
      (agent) =>
        agent.displayName.toLowerCase().includes(query) ||
        agent.id.toLowerCase().includes(query),
    )
  }, [agents, searchQuery])

  // Scroll focused item into view when focus changes via keyboard
  useEffect(() => {
    const scrollbox = scrollRef.current
    if (!scrollbox || filteredAgents.length === 0) return

    // Calculate approximate position of focused item (1 line per item)
    const itemHeight = 1
    const focusedTop = focusedIndex * itemHeight
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
  }, [focusedIndex, filteredAgents.length])

  if (filteredAgents.length === 0) {
    return (
      <box style={{ paddingLeft: 1, paddingTop: 1 }}>
        <text style={{ fg: theme.muted, attributes: TextAttributes.ITALIC }}>
          {searchQuery ? 'No agents match your search' : 'No agents available'}
        </text>
      </box>
    )
  }

  const needsScroll = filteredAgents.length > maxHeight

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
        {filteredAgents.map((agent, idx) => {
          const isSelected = selectedIds.has(agent.id)
          const isFocused = idx === focusedIndex
          const isHovered = idx === hoveredIndex
          const isHighlighted = isFocused || isHovered
          const depCount = dependencyCounts.get(agent.id) ?? 0
          const isExpanded = expandedAgentIds.has(agent.id)
          const isSubagentLinkHovered = hoveredSubagentLink === agent.id

          const symbol = isSelected
            ? SYMBOLS.CHECKBOX_CHECKED
            : SYMBOLS.CHECKBOX_UNCHECKED

          const displayText =
            agent.displayName !== agent.id
              ? `${agent.displayName} (${agent.id})`
              : agent.displayName

          return (
            <React.Fragment key={agent.id}>
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
                      attributes: isHighlighted ? TextAttributes.BOLD : undefined,
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
                      attributes: isHighlighted ? TextAttributes.BOLD : undefined,
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
                      {isExpanded ? `(- ${depCount} subagent${depCount === 1 ? '' : 's'})` : `(+ ${depCount} subagent${depCount === 1 ? '' : 's'})`}
                    </text>
                  </Button>
                )}
              </box>

              {/* Expanded dependency tree */}
              {isExpanded && depCount > 0 && (
                <DepTree
                  nodes={buildDepTree(agent.id, agents, agentDefinitions, localAgentIds, new Set())}
                  depth={0}
                  theme={theme}
                />
              )}
            </React.Fragment>
          )
        })}
      </scrollbox>

      {/* Selection count */}
      <box style={{ marginTop: 1, marginLeft: 1 }}>
        <text style={{ fg: theme.secondary }}>
          {selectedIds.size === 0
            ? 'No agents selected'
            : `Selected: ${Array.from(selectedIds).join(', ')}`}
        </text>
      </box>
    </box>
  )
}
