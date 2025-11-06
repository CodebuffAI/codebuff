import { useState } from 'react'
import type { ChatTheme } from '../types/theme-system'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
}: {
  theme: ChatTheme
  onBuildFast: () => void
  onBuildMax: () => void
}) => {
  const [hoveredButton, setHoveredButton] = useState<'fast' | 'max' | null>(null)
  return (
    <box
      style={{
        flexDirection: 'column',
        gap: 0,
        paddingTop: 1,
        paddingBottom: 1,
        paddingLeft: 1,
      }}
    >
      <text style={{ wrapMode: 'none', marginBottom: 1 }}>
        <span fg={theme.secondary}>Ready to build? Choose your mode:</span>
      </text>
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
            borderColor: hoveredButton === 'fast' ? '#ffffff' : theme.secondary,
          }}
          onMouseDown={onBuildFast}
          onMouseOver={() => setHoveredButton('fast')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg="#ffffff">Build FAST</span>
          </text>
        </box>
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: 2,
            paddingRight: 2,
            borderStyle: 'single',
            borderColor: hoveredButton === 'max' ? '#ffffff' : theme.secondary,
          }}
          onMouseDown={onBuildMax}
          onMouseOver={() => setHoveredButton('max')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg="#ffffff">Build MAX</span>
          </text>
        </box>
      </box>
    </box>
  )
}
