import React, { useState } from 'react'

import { Button } from './button'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { BORDER_CHARS } from '../utils/ui-constants'

export interface BannerWrapperProps {
  color: string
  text: string
  onClose: () => void
}

export const BannerWrapper = ({ color, text, onClose }: BannerWrapperProps) => {
  const { terminalWidth } = useTerminalDimensions()
  const theme = useTheme()
  const [isCloseHovered, setIsCloseHovered] = useState(false)

  const isWideTerminal = terminalWidth > 80

  return (
    <box
      key={terminalWidth}
      style={{
        marginLeft: isWideTerminal ? 1 : 0,
        marginRight: isWideTerminal ? 1 : 0,
        borderStyle: 'single',
        borderColor: color,
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingLeft: 1,
        paddingRight: 1,
        marginTop: 0,
        marginBottom: 0,
      }}
      border={['bottom', 'left', 'right']}
      customBorderChars={BORDER_CHARS}
    >
      <text
        style={{
          fg: color,
          wrapMode: 'word',
          flexShrink: 1,
          marginRight: 3,
        }}
      >
        {text}
      </text>
      <Button
        onClick={onClose}
        onMouseOver={() => setIsCloseHovered(true)}
        onMouseOut={() => setIsCloseHovered(false)}
      >
        <text style={{ fg: isCloseHovered ? theme.error : theme.muted }}>x</text>
      </Button>
    </box>
  )
}
