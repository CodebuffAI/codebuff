import { pluralize } from '@codebuff/common/util/string'
import { TextAttributes } from '@opentui/core'
import React, { memo, useCallback } from 'react'

import { GridLayout } from './grid-layout'
import { useTheme } from '../hooks/use-theme'
import type { AgentContentBlock } from '../types/chat'

export interface AgentBlockGridProps {
  agentBlocks: AgentContentBlock[]
  keyPrefix: string
  availableWidth: number
  streamingAgents: Set<string>
  renderAgentBranch: (
    agentBlock: AgentContentBlock,
    keyPrefix: string,
    availableWidth: number,
  ) => React.ReactNode
}

export function getAgentStatusSummary(
  agentBlocks: AgentContentBlock[],
  streamingAgents: Set<string>,
): string {
  const running = agentBlocks.filter(
    (agent) => agent.status === 'running' || streamingAgents.has(agent.agentId),
  ).length
  const failed = agentBlocks.filter((agent) => agent.status === 'failed').length
  const completed = agentBlocks.filter((agent) => agent.status === 'complete').length

  if (running > 0) {
    return `${pluralize(agentBlocks.length, 'agent')} running`
  }

  if (failed > 0 && completed > 0) {
    return `${failed} failed, ${completed} completed`
  }

  if (failed > 0) {
    return `${pluralize(failed, 'agent')} failed`
  }

  return `${pluralize(agentBlocks.length, 'agent')} completed`
}

export const AgentBlockGrid = memo(
  ({
    agentBlocks,
    keyPrefix,
    availableWidth,
    streamingAgents,
    renderAgentBranch,
  }: AgentBlockGridProps) => {
    const theme = useTheme()

    const getItemKey = useCallback(
      (agentBlock: AgentContentBlock) => agentBlock.agentId,
      [],
    )

    const renderItem = useCallback(
      (agentBlock: AgentContentBlock, idx: number, columnWidth: number) =>
        renderAgentBranch(agentBlock, `${keyPrefix}-agent-${idx}`, columnWidth),
      [keyPrefix, renderAgentBranch],
    )

    if (agentBlocks.length === 0) return null

    const headerText = getAgentStatusSummary(agentBlocks, streamingAgents)
    const hasFailed = agentBlocks.some((agent) => agent.status === 'failed')
    const showHeader = agentBlocks.length > 1

    const footer = showHeader ? (
      <text
        fg={hasFailed ? theme.error : theme.muted}
        attributes={TextAttributes.DIM}
      >
        {headerText}
      </text>
    ) : undefined

    return (
      <GridLayout
        items={agentBlocks}
        availableWidth={availableWidth}
        getItemKey={getItemKey}
        renderItem={renderItem}
        footer={footer}
        marginTop={1}
      />
    )
  },
)
