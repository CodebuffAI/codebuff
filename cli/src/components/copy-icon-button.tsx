import { TextAttributes } from '@opentui/core'
import React from 'react'

import { useHoverToggle } from './agent-mode-toggle'
import { Button } from './button'
import { useTheme } from '../hooks/use-theme'
import { copyTextToClipboard } from '../utils/clipboard'

interface CopyIconButtonProps {
  textToCopy: string
}

export const CopyIconButton: React.FC<CopyIconButtonProps> = ({
  textToCopy,
}) => {
  const theme = useTheme()
  const hover = useHoverToggle()

  const handleClick = async () => {
    try {
      await copyTextToClipboard(textToCopy, {
        successMessage: 'Message copied to clipboard',
        durationMs: 2000,
      })
    } catch (error) {
      // Error is already logged and displayed by copyTextToClipboard
    }
  }

  const handleMouseOver = () => {
    hover.clearCloseTimer()
    hover.scheduleOpen()
  }

  const handleMouseOut = () => {
    hover.scheduleClose()
  }

  const textCollapsed = '⎘'
  const textExpanded = '[⎘ copy]'

  return (
    <Button
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 0,
        paddingRight: 0,
      }}
      onClick={handleClick}
      onMouseOver={handleMouseOver}
      onMouseOut={handleMouseOut}
    >
      <text
        style={{
          wrapMode: 'none',
          fg: hover.isOpen ? theme.foreground : theme.muted,
        }}
      >
        {hover.isOpen ? (
          textExpanded
        ) : (
          <span attributes={TextAttributes.DIM}>{textCollapsed}</span>
        )}
      </text>
    </Button>
  )
}
