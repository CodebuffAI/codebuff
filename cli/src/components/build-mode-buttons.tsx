import { useState } from 'react'
import type { ChatTheme } from '../types/theme-system'
import { BORDER_CHARS } from '../utils/ui-constants'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { Button } from './button'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
  messageId,
}: {
  theme: ChatTheme
  onBuildFast: (messageId: string) => void
  onBuildMax: (messageId: string) => void
  messageId: string
}) => {
  const [hoveredButton, setHoveredButton] = useState<'fast' | 'max' | null>(
    null,
  )
  const { terminalWidth } = useTerminalDimensions()
  const isNarrow = terminalWidth < 55

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
            borderColor:
              hoveredButton === 'fast' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={() => onBuildFast(messageId)}
          onMouseOver={() => setHoveredButton('fast')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build DEFAULT</span>
          </text>
        </Button>
        <Button
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor:
              hoveredButton === 'max' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={() => onBuildMax(messageId)}
          onMouseOver={() => setHoveredButton('max')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build MAX</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
