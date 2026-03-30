import React, { memo, useCallback, useMemo } from 'react'

import { GridLayout } from '../grid-layout'
import { splitAgentsBySize } from '../../utils/block-processor'

import type { AgentContentBlock } from '../../types/chat'

export interface AgentBlockGridProps {
  agentBlocks: AgentContentBlock[]
  keyPrefix: string
  availableWidth: number
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

    const subGroups = useMemo(
      () => splitAgentsBySize(agentBlocks),
      [agentBlocks],
    )

    if (agentBlocks.length === 0) return null

    return (
      <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
        {subGroups.map((group) => (
          <GridLayout
            key={getItemKey(group[0])}
            items={group}
            availableWidth={availableWidth}
            getItemKey={getItemKey}
            renderItem={renderItem}
          />
        ))}
      </box>
    )
  },
)
