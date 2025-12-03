/**
 * "Other" text input component for custom answers
 */

import { TextAttributes, type KeyEvent } from '@opentui/core'
import React from 'react'

import { useTheme } from '../../../hooks/use-theme'
import { Button } from '../../button'
import { MultilineInput } from '../../multiline-input'
import { SYMBOLS } from '../constants'

import type { InputValue } from '../../../state/chat-store'

// Width taken by symbol + "Other:" label + padding
const LABEL_WIDTH = 10

export interface OtherTextInputProps {
  text: string
  isFocused: boolean
  hasText: boolean
  isSelected: boolean
  width: number
  cursorPosition: number
  onClick: () => void
  onMouseOver: () => void
  onChange: (value: InputValue) => void
  onSubmit: () => void
}

export const OtherTextInput: React.FC<OtherTextInputProps> = ({
  text,
  isFocused,
  hasText,
  isSelected,
  width,
  cursorPosition,
  onClick,
  onMouseOver,
  onChange,
  onSubmit,
}) => {
  const theme = useTheme()

  const placeholder = 'Type your own answer...'

  // Calculate available width for the input (full width minus label and padding)
  const inputWidth = Math.max(10, width - LABEL_WIDTH)

  // Intercept navigation keys that should be handled by the ask-user form
  const handleKeyIntercept = (key: KeyEvent): boolean => {
    // Let Up/Down/Tab be handled by the form's navigation
    if (
      (key.name === 'up' || key.name === 'down' || key.name === 'tab') &&
      !key.ctrl &&
      !key.meta
    ) {
      return true
    }
    return false
  }

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
          fg:
            hasText || isSelected
              ? theme.primary
              : isFocused
                ? theme.foreground
                : theme.muted,
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
      <box style={{ flexGrow: 1, minWidth: 0, paddingLeft: 1 }}>
        <MultilineInput
          value={text}
          onChange={onChange}
          onSubmit={onSubmit}
          onKeyIntercept={handleKeyIntercept}
          placeholder={placeholder}
          focused={isFocused}
          maxHeight={3}
          minHeight={1}
          width={inputWidth}
          cursorPosition={cursorPosition}
        />
      </box>
    </Button>
  )
}
