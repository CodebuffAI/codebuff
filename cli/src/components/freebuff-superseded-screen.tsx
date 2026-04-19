import { TextAttributes } from '@opentui/core'
import React from 'react'

import { useFreebuffCtrlCExit } from '../hooks/use-freebuff-ctrl-c-exit'
import { useLogo } from '../hooks/use-logo'
import { useTerminalDimensions } from '../hooks/use-terminal-dimensions'
import { useTheme } from '../hooks/use-theme'
import { getLogoAccentColor, getLogoBlockColor } from '../utils/theme-system'

/**
 * Terminal state shown after a 409 session_superseded response. Another CLI on
 * the same account rotated our instance id and we've stopped polling — the
 * user needs to close the other instance and restart.
 */
export const FreebuffSupersededScreen: React.FC = () => {
  const theme = useTheme()
  const { contentMaxWidth } = useTerminalDimensions()
  const blockColor = getLogoBlockColor(theme.name)
  const accentColor = getLogoAccentColor(theme.name)
  const { component: logoComponent } = useLogo({
    availableWidth: contentMaxWidth,
    accentColor,
    blockColor,
  })

  useFreebuffCtrlCExit()

  return (
    <box
      style={{
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        backgroundColor: theme.background,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 2,
        paddingRight: 2,
        gap: 1,
      }}
    >
      <box style={{ marginBottom: 1 }}>{logoComponent}</box>
      <text
        style={{ fg: theme.foreground, marginBottom: 1 }}
        attributes={TextAttributes.BOLD}
      >
        Another freebuff instance took over this account.
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        Only one CLI per account can be active at a time.
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        Close the other instance, then restart freebuff here.
      </text>
      <box style={{ marginTop: 1 }}>
        <text style={{ fg: theme.muted }}>
          Press <span fg={theme.primary}>Ctrl+C</span> to exit.
        </text>
      </box>
    </box>
  )
}
