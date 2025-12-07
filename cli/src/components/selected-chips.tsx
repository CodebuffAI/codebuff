import { TextAttributes } from '@opentui/core'
import React, { useState } from 'react'

import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

interface SelectedChipsProps {
  selectedAgents: Array<{ id: string; displayName: string }>
  onRemove: (agentId: string) => void
}

export const SelectedChips: React.FC<SelectedChipsProps> = ({
  selectedAgents,
  onRemove,
}) => {
  const theme = useTheme()
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null)

  if (selectedAgents.length === 0) {
    return null
  }

  return (
    <box style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 1, paddingRight: 1, flexWrap: 'wrap' }}>
      {selectedAgents.map((agent) => {
        const isHovered = hoveredChipId === agent.id
        const displayText = agent.displayName !== agent.id
          ? agent.displayName
          : agent.id

        return (
          <Button
            key={agent.id}
            onClick={() => onRemove(agent.id)}
            onMouseOver={() => setHoveredChipId(agent.id)}
            onMouseOut={() => setHoveredChipId(null)}
            style={{
              backgroundColor: 'transparent',
              paddingLeft: 0,
              paddingRight: 0,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          >
            <box
              border
              borderStyle="single"
              borderColor={isHovered ? theme.error : theme.success}
              customBorderChars={BORDER_CHARS}
              style={{
                flexDirection: 'row',
                gap: 1,
                paddingLeft: 1,
                paddingRight: 1,
              }}
            >
              <text
                style={{
                  fg: isHovered ? theme.error : theme.success,
                  attributes: TextAttributes.BOLD,
                }}
              >
                {displayText}
              </text>
              <text
                style={{
                  fg: isHovered ? theme.error : theme.muted,
                }}
              >
                ✕
              </text>
            </box>
          </Button>
        )
      })}

    </box>
  )
}
