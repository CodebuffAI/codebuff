import { useState } from 'react'
import type { ChatTheme } from '../types/theme-system'
import { BORDER_CHARS } from '../utils/ui-constants'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
}: {
  theme: ChatTheme
  onBuildFast: () => void
  onBuildMax: () => void
}) => {
  const [hoveredButton, setHoveredButton] = useState<'fast' | 'max' | null>(
    null,
  )
  const { terminalWidth } = useTerminalDimensions()
  const isNarrow = terminalWidth < 55
  return (
    <box
      style={{
        flexDirection: 'row',
        gap: 1,
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: 1,
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {isNarrow ? null : (
        <text style={{ wrapMode: 'none' }}>
          <span fg={theme.secondary}>Ready to build?</span>
        </text>
      )}
      <box
        style={{
          flexDirection: 'row',
          gap: 2,
        }}
      >
        <box
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
          onMouseDown={onBuildFast}
          onMouseOver={() => setHoveredButton('fast')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build DEFAULT</span>
          </text>
        </box>
        <box
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
          onMouseDown={onBuildMax}
          onMouseOver={() => setHoveredButton('max')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build MAX</span>
          </text>
        </box>
      </box>
    </box>
  )
}
