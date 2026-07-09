import { useState } from 'react'

import { Button } from './button'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ChatTheme } from '../types/theme-system'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
}: {
  theme: ChatTheme
  onBuildFast: () => void
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { width } = useTerminalLayout()
  const isNarrow = width.is('xs')

  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
      }}
    >
      {isNarrow ? null : (
        <text style={{ wrapMode: 'none' }} selectable={false}>
          <span fg={theme.secondary}>Choose an option to build this plan:</span>
        </text>
      )}
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
        }}
      >
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor: isHovered ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildFast}
          onMouseOver={() => setIsHovered(true)}
          onMouseOut={() => setIsHovered(false)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Execute Plan</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
