import { useState } from 'react'
import type { ChatTheme } from '../types/theme-system'
import { BORDER_CHARS } from '../utils/ui-constants'
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
      <text style={{ wrapMode: 'none' }}>
        <span fg={theme.secondary}>Choose an option to build this plan:</span>
      </text>
      <box
        style={{
          flexDirection: 'row',
          gap: 1,
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
