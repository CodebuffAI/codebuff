import { TextAttributes } from '@opentui/core'
import React from 'react'
import stringWidth from 'string-width'

import { useTheme } from '../hooks/use-theme'

interface ModeDividerProps {
  mode: string
  width: number
}

export const ModeDivider = ({ mode, width }: ModeDividerProps) => {
  const theme = useTheme()

  const label = ` ${mode} `
  const labelWidth = stringWidth(label)
  const lineWidth = Math.max(0, Math.floor((width - labelWidth) / 2))
  const leftLine = '─'.repeat(lineWidth)
  const rightLine = '─'.repeat(Math.max(0, width - lineWidth - labelWidth))

  return (
    <box
      style={{
        width: '100%',
        flexDirection: 'row',
        justifyContent: 'center',
        paddingTop: 1,
        paddingBottom: 1,
      }}
    >
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.border}>{leftLine}</span>
        <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
          {label}
        </span>
        <span fg={theme.border}>{rightLine}</span>
      </text>
    </box>
  )
}
