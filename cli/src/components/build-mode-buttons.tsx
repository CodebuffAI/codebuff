import { useState } from 'react'

import { Button } from './button'
import { useTerminalLayout } from '../hooks/use-terminal-layout'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { ChatTheme } from '../types/theme-system'

export const BuildModeButtons = ({
  theme,
  onBuildFast,
  onBuildMax,
  onBuildFree,
}: {
  theme: ChatTheme
  onBuildFast: () => void
  onBuildMax: () => void
  onBuildFree: () => void
}) => {
  const [hoveredButton, setHoveredButton] = useState<'fast' | 'max' | 'free' | null>(
    null,
  )
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
            borderColor:
              hoveredButton === 'fast' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildFast}
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
          onClick={onBuildMax}
          onMouseOver={() => setHoveredButton('max')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build MAX</span>
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
              hoveredButton === 'free' ? theme.foreground : theme.secondary,
            customBorderChars: BORDER_CHARS,
          }}
          onClick={onBuildFree}
          onMouseOver={() => setHoveredButton('free')}
          onMouseOut={() => setHoveredButton(null)}
        >
          <text wrapMode="none">
            <span fg={theme.foreground}>Build FREE</span>
          </text>
        </Button>
      </box>
    </box>
  )
}
