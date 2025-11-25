/**
 * "Other" text input component for custom answers
 */

import React from 'react'
import { TextAttributes } from '@opentui/core'
import { Button } from '../../button'
import { useTheme } from '../../../hooks/use-theme'
import { SYMBOLS } from '../constants'

export interface OtherTextInputProps {
  text: string
  isFocused: boolean
  hasText: boolean
  isSelected: boolean
  onClick: () => void
  onMouseOver: () => void
}

export const OtherTextInput: React.FC<OtherTextInputProps> = ({
  text,
  isFocused,
  hasText,
  isSelected,
  onClick,
  onMouseOver,
}) => {
  const theme = useTheme()

  // Display placeholder or actual text with cursor
  const displayText = text || (isFocused ? '' : 'Type your own answer...')
  const textWithCursor = isFocused && text ? `${text}|` : isFocused ? '|' : displayText

  return (
    <Button
      onClick={onClick}
      onMouseOver={onMouseOver}
      style={{
        flexDirection: 'row',
        gap: 1,
        backgroundColor: isFocused ? theme.surface : undefined,
        marginTop: 0,
        paddingTop: 0,
        paddingBottom: 0,
      }}
    >
      <text
        style={{
          fg: hasText || isSelected ? theme.primary : isFocused ? theme.foreground : theme.muted,
          attributes: isFocused ? TextAttributes.BOLD : undefined,
        }}
      >
        {hasText || isSelected ? SYMBOLS.SELECTED : SYMBOLS.UNSELECTED}
      </text>
      <text
        style={{
          fg: isFocused ? theme.foreground : theme.muted,
          attributes: isFocused ? TextAttributes.BOLD : undefined,
        }}
      >
        Other:
      </text>
      <text
        style={{
          fg: hasText ? theme.primary : theme.muted,
          attributes: isFocused ? TextAttributes.BOLD : undefined,
        }}
      >
        {textWithCursor}
      </text>
    </Button>
  )
}
