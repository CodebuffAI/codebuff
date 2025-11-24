/**
 * Skip button component for ask_user form
 */

import React from 'react'
import { TextAttributes } from '@opentui/core'
import { Button } from '../../button'
import { useTheme } from '../../../hooks/use-theme'
import { BORDER_CHARS } from '../../../utils/ui-constants'

export interface SkipButtonProps {
  onClick: () => void
  isFocused?: boolean
  isHovered?: boolean
  onMouseOver?: () => void
  onMouseOut?: () => void
}

export const SkipButton: React.FC<SkipButtonProps> = ({
  onClick,
  isFocused = false,
  isHovered = false,
  onMouseOver,
  onMouseOut,
}) => {
  const theme = useTheme()

  const isHighlighted = isFocused || isHovered

  return (
    <Button
      onClick={onClick}
      onMouseOver={onMouseOver}
      onMouseOut={onMouseOut}
      style={{
        borderStyle: 'single',
        borderColor: isHighlighted ? theme.error : theme.secondary,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        backgroundColor: isFocused ? theme.surface : undefined,
      }}
    >
      <text
        style={{
          fg: isHighlighted ? theme.error : theme.muted,
          attributes: isHighlighted ? TextAttributes.BOLD : undefined,
        }}
      >
        Skip
      </text>
    </Button>
  )
}
