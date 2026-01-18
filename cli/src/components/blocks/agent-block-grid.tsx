import React, { memo, useCallback } from 'react'

import { GridLayout } from '../grid-layout'
import type { AgentContentBlock } from '../../types/chat'

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

export const AgentBlockGrid = memo(
  ({
    agentBlocks,
    keyPrefix,
    availableWidth,
    renderAgentBranch,
  }: AgentBlockGridProps) => {
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

    return (
      <GridLayout
        items={agentBlocks}
        availableWidth={availableWidth}
        getItemKey={getItemKey}
        renderItem={renderItem}
        marginTop={1}
      />
    )
  },
)
